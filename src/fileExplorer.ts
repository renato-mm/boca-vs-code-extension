import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as rimraf from 'rimraf';
import axios from 'axios';
import * as extract from 'extract-zip';
import * as stream from 'stream';
import { promisify } from 'util';

const finished = promisify(stream.finished);

//#region Utilities

namespace _ {

	function handleResult<T>(resolve: (result: T) => void, reject: (error: Error) => void, error: Error | null | undefined, result: T): void {
		if (error) {
			reject(massageError(error));
		} else {
			resolve(result);
		}
	}

	function massageError(error: Error & { code?: string }): Error {
		if (error.code === 'ENOENT') {
			return vscode.FileSystemError.FileNotFound();
		}

		if (error.code === 'EISDIR') {
			return vscode.FileSystemError.FileIsADirectory();
		}

		if (error.code === 'EEXIST') {
			return vscode.FileSystemError.FileExists();
		}

		if (error.code === 'EPERM' || error.code === 'EACCES') {
			return vscode.FileSystemError.NoPermissions();
		}

		return error;
	}

	export function checkCancellation(token: vscode.CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new Error('Operation cancelled');
		}
	}

	export function normalizeNFC(items: string): string;
	export function normalizeNFC(items: string[]): string[];
	export function normalizeNFC(items: string | string[]): string | string[] {
		if (process.platform !== 'darwin') {
			return items;
		}

		if (Array.isArray(items)) {
			return items.map(item => item.normalize('NFC'));
		}

		return items.normalize('NFC');
	}

	export function readdir(path: string): Promise<string[]> {
		return new Promise<string[]>((resolve, reject) => {
			fs.readdir(path, (error, children) => handleResult(resolve, reject, error, normalizeNFC(children)));
		});
	}

	export function stat(path: string): Promise<fs.Stats> {
		return new Promise<fs.Stats>((resolve, reject) => {
			fs.stat(path, (error, stat) => handleResult(resolve, reject, error, stat));
		});
	}

	export function readfile(path: string): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			fs.readFile(path, (error, buffer) => handleResult(resolve, reject, error, buffer));
		});
	}

	export function writefile(path: string, content: Buffer): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.writeFile(path, content, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function exists(path: string): Promise<boolean> {
		return new Promise<boolean>((resolve, reject) => {
			fs.exists(path, exists => handleResult(resolve, reject, null, exists));
		});
	}

	export function rmrf(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			rimraf(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function mkdir(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			mkdirp(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function rename(oldPath: string, newPath: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.rename(oldPath, newPath, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function unlink(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.unlink(path, error => handleResult(resolve, reject, error, void 0));
		});
	}
}

export class FileStat implements vscode.FileStat {

	constructor(private fsStat: fs.Stats) { }

	get type(): vscode.FileType {
		return this.fsStat.isFile() ? vscode.FileType.File : this.fsStat.isDirectory() ? vscode.FileType.Directory : this.fsStat.isSymbolicLink() ? vscode.FileType.SymbolicLink : vscode.FileType.Unknown;
	}

	get isFile(): boolean | undefined {
		return this.fsStat.isFile();
	}

	get isDirectory(): boolean | undefined {
		return this.fsStat.isDirectory();
	}

	get isSymbolicLink(): boolean | undefined {
		return this.fsStat.isSymbolicLink();
	}

	get size(): number {
		return this.fsStat.size;
	}

	get ctime(): number {
		return this.fsStat.ctime.getTime();
	}

	get mtime(): number {
		return this.fsStat.mtime.getTime();
	}
}

interface Entry {
	uri: vscode.Uri;
	type: vscode.FileType;
}

//#endregion

export class FileSystemProvider implements vscode.TreeDataProvider<Entry>, vscode.FileSystemProvider {

	private _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]>;
	private _onDidChangeTreeData: vscode.EventEmitter<Entry | undefined | void> = new vscode.EventEmitter<Entry | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Entry | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext, private workspaceRoot: string | undefined) {
		this._onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

	watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
		const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, async (event, filename) => {
			if (filename) {
				const filepath = path.join(uri.fsPath, _.normalizeNFC(filename.toString()));

				// TODO support excludes (using minimatch library?)

				this._onDidChangeFile.fire([{
					type: event === 'change' ? vscode.FileChangeType.Changed : await _.exists(filepath) ? vscode.FileChangeType.Created : vscode.FileChangeType.Deleted,
					uri: uri.with({ path: filepath })
				} as vscode.FileChangeEvent]);
			}
		});

		return { dispose: () => watcher.close() };
	}

	stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
		return this._stat(uri.fsPath);
	}

	async _stat(path: string): Promise<vscode.FileStat> {
		return new FileStat(await _.stat(path));
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		return this._readDirectory(uri);
	}

	async _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const children = await _.readdir(uri.fsPath);

		const result: [string, vscode.FileType][] = [];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const stat = await this._stat(path.join(uri.fsPath, child));
			result.push([child, stat.type]);
		}

		return Promise.resolve(result);
	}

	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		return _.mkdir(uri.fsPath);
	}

	readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
		return _.readfile(uri.fsPath);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
		return this._writeFile(uri, content, options);
	}

	async _writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
		const exists = await _.exists(uri.fsPath);
		if (!exists) {
			if (!options.create) {
				throw vscode.FileSystemError.FileNotFound();
			}

			await _.mkdir(path.dirname(uri.fsPath));
		} else {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			}
		}

		return _.writefile(uri.fsPath, content as Buffer);
	}

	delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
		if (options.recursive) {
			return _.rmrf(uri.fsPath);
		}

		return _.unlink(uri.fsPath);
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
		return this._rename(oldUri, newUri, options);
	}

	async _rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
		const exists = await _.exists(newUri.fsPath);
		if (exists) {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			} else {
				await _.rmrf(newUri.fsPath);
			}
		}

		const parentExists = await _.exists(path.dirname(newUri.fsPath));
		if (!parentExists) {
			await _.mkdir(path.dirname(newUri.fsPath));
		}

		return _.rename(oldUri.fsPath, newUri.fsPath);
	}

	// tree data provider

	async getChildren(element?: Entry): Promise<Entry[]> {
		if (element) {
			const children = await this.readDirectory(element.uri);
			return children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(element.uri.fsPath, name)), type }));
		}

		const workspaceFolder = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file')[0];
		if (workspaceFolder) {
			const contests = await this._getContests();
			const children = await this.readDirectory(workspaceFolder.uri);
			for (let contest of contests) {
				const dirname = `${contest.contestnumber}-${contest.contestname}`;
				if (!children.find(child => child[0] === dirname)) {
					const uri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, dirname));
					await this.createDirectory(uri);
					this._getProblems(contest.contestnumber).then(problems => {
						this._createProblemsDirectories(uri, problems);
					});
					children.push([dirname, vscode.FileType.Directory]);
				}
			}
			children.sort((a, b) => {
				if (a[1] === b[1]) {
					return a[0].localeCompare(b[0]);
				}
				return a[1] === vscode.FileType.Directory ? -1 : 1;
			});
			return children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, name)), type }));
		}

		return [];
	}

	getTreeItem(element: Entry): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		if (element.type === vscode.FileType.File) {
			treeItem.command = { command: 'bocaExplorer.openFile', title: "Open File", arguments: [element.uri], };
			treeItem.contextValue = 'file';
		}
		return treeItem;
	}

	private async _getContests(): Promise<Contest[]> {
		const apiPath = vscode.workspace.getConfiguration().get<string>('boca.api.path');
		const accessToken = this.context.globalState.get<string>('accessToken');
		try {
			const response = await axios({
				method: 'get',
				url: apiPath + '/contest',
				headers: {
					authorization: 'Bearer ' + accessToken
				}
			});
			return (response.data || []).filter((contest: any) => contest.contestnumber !== 0);
		} catch (error: any) {
			if (error.response?.status === 401) {
				vscode.commands.executeCommand('setContext', 'boca.showSignInView', true);
				throw new Error('Token expired');
			}
			else {
				vscode.window.showErrorMessage('Fetching contests failed');
				console.error(error);
			}
			return [];
		}
	}

	private async _getProblems(contestNumber: number): Promise<Problem[]> {
		const apiPath = vscode.workspace.getConfiguration().get<string>('boca.api.path');
		const accessToken = this.context.globalState.get<string>('accessToken');
		try {
			const response = await axios({
				method: 'get',
				url: apiPath + '/contest/' + contestNumber + '/problem',
				headers: {
					authorization: 'Bearer ' + accessToken
				}
			});
			return (response.data || []).filter((problem: any) => !problem.fake);
		} catch (error) {
			vscode.window.showErrorMessage('Fetching problems failed');
			console.error(error);
			return [];
		}
	}

	private async _createProblemsDirectories(uri: vscode.Uri, problems: Problem[]) {
		const children = await this.readDirectory(uri);
		for (let problem of problems) {
			if (!children.find(child => child[0] === problem.problemname)) {
				const problemUri = vscode.Uri.file(path.join(uri.fsPath, problem.problemname));
				await this.createDirectory(problemUri);
				this._downloadProblemFile(problemUri, problem);
			}
		}
	}

	private async _downloadProblemFile(uri: vscode.Uri, problem: Problem): Promise<void> {
		const apiPath = vscode.workspace.getConfiguration().get<string>('boca.api.path');
		const accessToken = this.context.globalState.get<string>('accessToken');
		const tempFolderPath = path.join(uri.fsPath, 'temp');
		fs.mkdirSync(tempFolderPath);
		const tempFilePath = path.join(tempFolderPath, 'temp.zip');
		const descriptionFolderPath = path.join(tempFolderPath, 'description');
		const writer = fs.createWriteStream(tempFilePath);
		const readDir = _.readdir;
		return new Promise((resolve, reject) => {
			axios({
				method: 'get',
				url: apiPath + '/contest/' + problem.contestnumber + '/problem/' + problem.problemnumber + '/file',
				responseType: 'stream',
				headers: {
					authorization: 'Bearer ' + accessToken
				}
			}).then(response => {
				response.data.pipe(writer);
				return finished(writer);
			}).then(_ => {
				return extract(tempFilePath, { dir: tempFolderPath });
			}).then(_ => {
				return readDir(descriptionFolderPath);
			}).then(files => {
				const problemFilename = files.find(file => file.includes('.zip'));
				if (!problemFilename) { throw new Error('File not found'); }
				const problemFilePath = path.join(descriptionFolderPath, problemFilename);
				return extract(problemFilePath, { dir: uri.path });
			}).then(_ => {
				fs.rmSync(path.join(tempFolderPath), { recursive: true, force: true });
				resolve();
			}).catch(error => {
				vscode.window.showErrorMessage('Error downloading problem');
				console.error(error);
				fs.rmSync(path.join(uri.fsPath), { recursive: true, force: true });
				reject();
			});
    });
	}
}

interface Contest {
	contestnumber: number,
	contestname: string,
	conteststartdate: number,
	contestduration: number,
	contestlastmileanswer?: number,
	contestlastmilescore?: number,
	contestlocalsite: number,
	contestpenalty: number,
	contestmaxfilesize: number,
	contestactive: boolean,
	contestmainsite: number,
	contestkeys: string,
	contestunlockkey: string,
	contestmainsiteurl: string
}

interface Problem {
	contestnumber: number,
	problemnumber: number,
	problemname: string,
	problemfullname?: string,
	problembasefilename?: string,
	probleminputfilename?: string,
	probleminputfile?: number,
	probleminputfilehash?: string,
	fake: boolean,
	problemcolorname?: string,
	problemcolor?: string
}
