import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import axios from 'axios';
import * as extract from 'extract-zip';
import * as stream from 'stream';
import { promisify } from 'util';
import { treeFileDecorationProvider } from './treeFileDecorationProvider';

const finished = promisify(stream.finished);

//#region Utilities

namespace _ {

	function handleResult<T>(resolve: (result: T) => void, reject: (error: Error) => void, error: Error | null | undefined, result: T): void {
		if (error) {
			reject(messageError(error));
		} else {
			resolve(result);
		}
	}

	function messageError(error: Error & { code?: string }): Error {
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

	export function mkdir(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			mkdirp(path, error => handleResult(resolve, reject, error, void 0));
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

export interface Entry {
	uri: vscode.Uri;
	type: vscode.FileType;
	exists?: boolean;
	color?: string;
	solved?: boolean;
	contextValue?: string;
	problemNumber?: number;
	contestNumber?: number;
}

//#endregion

export class FileSystemProvider implements vscode.TreeDataProvider<Entry> {
	private _contests: Map<string, { contest: Contest; problems: Map<string, { problem: Problem; runs: Map<number, Run>; }>; }>;
	private _workspaceFolder: vscode.WorkspaceFolder;
	private _folderPath: string;

	private _onDidChangeTreeData: vscode.EventEmitter<Entry | undefined | void> = new vscode.EventEmitter<Entry | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Entry | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext) {
		this._contests = new Map();
		this._workspaceFolder = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file')[0];
		this._folderPath = path.join(context.storageUri!.fsPath, '..', 'boca-extension');
		_.mkdir(this._folderPath);
	}

	async refresh(fetchData = true): Promise<void> {
		this._onDidChangeTreeData.fire();
		if (fetchData) {
			await this._getContests();
		}
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

	// tree data provider

	async getChildren(element?: Entry): Promise<Entry[]> {
		const children: Entry[] = [];

		if (element) {
			switch (element.contextValue) {
				case 'contest':
					const contestName = path.parse(element.uri.fsPath).base;
					const contest = this._contests.get(contestName);
					if (contest) {
						for (let [problemName, { problem, runs }] of contest.problems) {
							const uri = vscode.Uri.file(path.join(element.uri.fsPath, problemName));
							let exists = fs.existsSync(uri.fsPath);
							if (exists) {
								const stat = fs.statSync(uri.fsPath);
								exists = stat.isDirectory();
							}
							const solved = [...(runs.values() || [])].some(run => run.runanswer === 1);
							children.push({
								uri,
								type: vscode.FileType.Directory,
								exists,
								contextValue: 'problem',
								contestNumber: problem.contestnumber,
								problemNumber: problem.problemnumber,
								solved
							});
							treeFileDecorationProvider.syncDecorator(uri, exists);
							treeFileDecorationProvider.updateProblemDecorator(uri, solved, problem.problemcolorname!.toLowerCase());
						}
					}
					break;
				
				case 'problem':
					const { base: problemName, dir } = path.parse(element.uri.fsPath);
					const { problem } = this._contests.get(path.parse(dir).base)?.problems.get(problemName) || {};
					if (problem?.probleminputfilename) {
						const uri = vscode.Uri.file(path.join(element.uri.fsPath, problem.probleminputfilename));
						let exists = fs.existsSync(uri.fsPath);
						if (exists) {
							const stat = fs.statSync(uri.fsPath);
							exists = stat.isFile();
						}
						children.push({
							uri,
							type: vscode.FileType.File,
							exists,
							contextValue: 'file',
							contestNumber: problem.contestnumber,
							problemNumber: problem.problemnumber,
						});
						treeFileDecorationProvider.syncDecorator(uri, exists);
					}
					break;
			}
		}
		else {
			await this._getContests();
			const currentChildren = await this.readDirectory(this._workspaceFolder.uri);
			for (let [contestName, { contest }] of this._contests) {
				const currentChild = currentChildren.find(child => child[0] === contestName);
				const uri = vscode.Uri.file(path.join(this._workspaceFolder.uri.fsPath, contestName));
				const exists = Boolean(currentChild);
				children.push({
					uri,
					type: currentChild?.[1] ?? vscode.FileType.Directory,
					exists,
					contextValue: 'contest',
					contestNumber: contest.contestnumber,
				});
				treeFileDecorationProvider.syncDecorator(uri, exists);
			}
		}
		return children;
	}

	getTreeItem(element: Entry): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		treeItem.tooltip = path.basename(element.uri.path);
		treeItem.contextValue = element.contextValue || 'file';
		if (element.contextValue === 'problem') {
			treeItem.command = { command: 'bocaExplorer.selectProblem', title: "Select Problem", arguments: [element.contestNumber, element.problemNumber], };
		}
		return treeItem;
	}

	getContestNumber(contestName: string): number {
		return this._contests.get(contestName)?.contest.contestnumber || 0;
	}

	getProblemNumber(contestName: string, problemName: string): number {
		return this._contests.get(contestName)?.problems.get(problemName)?.problem.problemnumber || 0;
	}

	submitRun(element: Entry): void {
		console.log(element);
	}

	async synchronize(element?: Entry): Promise<void> {
		if (element) {
			switch (element.contextValue) {
				case 'contest':
					await this.createDirectory(element.uri);
					const contestName = path.parse(element.uri.fsPath).base;
					const contest = this._contests.get(contestName);
					if (contest) {
						for (let [problemName, { problem }] of contest.problems) {
							const uri = vscode.Uri.file(path.join(element.uri.fsPath, problemName));
							await this.createDirectory(uri);
							if (problem) {
								await this._downloadProblemFile(uri, problem);
							}
						}
					}
					break;
				
				case 'problem':
					await this.createDirectory(element.uri);
					const { base: problemName1, dir: contestDir1 } = path.parse(element.uri.fsPath);
					const { problem: problem1 } = this._contests.get(path.parse(contestDir1).base)?.problems.get(problemName1) || {};
					if (problem1) {
						await this._downloadProblemFile(element.uri, problem1);
					}
					break;
				
				case 'file':
					const problemDir = path.parse(element.uri.fsPath).dir;
					const { base: problemName2, dir: contestDir2 } = path.parse(problemDir);
					const { problem: problem2 } = this._contests.get(path.parse(contestDir2).base)?.problems.get(problemName2) || {};
					const uri = vscode.Uri.file(problemDir);
					await this.createDirectory(uri);
					if (problem2) {
						await this._downloadProblemFile(uri, problem2);
					}
					break;
			}
		}
		else {
			for (let [contestName, { problems }] of this._contests) {
				const uri = vscode.Uri.file(path.join(this._workspaceFolder.uri.fsPath, contestName));
				await this.createDirectory(uri);
				for (let [problemName, { problem }] of (problems || [])) {
					const problemUri = vscode.Uri.file(path.join(uri.fsPath, problemName));
					await this.createDirectory(problemUri);
					if (problem) {
						await this._downloadProblemFile(problemUri, problem);
					}
				}
			}
		}
		this._onDidChangeTreeData.fire();
	}

	private async _getContests(): Promise<void> {
		const apiPath = vscode.workspace.getConfiguration().get<string>('boca.api.path');
		const accessToken = this.context.globalState.get<string>('accessToken');
		try {
			const response = await axios<Array<Contest>>({
				method: 'get',
				url: apiPath + '/contest',
				headers: {
					authorization: 'Bearer ' + accessToken
				}
			});
			for (let contest of (response.data || [])) {
				if (contest.contestnumber !== 0) {
					contest.contesturi = vscode.Uri.file(path.join(this._workspaceFolder.uri.fsPath, contest.contestname));
					this._contests.set(contest.contestname, { contest, problems: new Map() });
					await this._getProblems(contest.contestnumber, contest.contestname);
				}
			};
		} catch (error: any) {
			if (error.response?.status === 401) {
				vscode.commands.executeCommand('setContext', 'boca.showSignInView', true);
				vscode.window.showErrorMessage('Token expired');
			}
			else {
				vscode.window.showErrorMessage('Fetching contests failed');
				console.error(error);
			}
		}
	}

	private async _getProblems(contestNumber: number, contestName: string): Promise<void> {
		const contest = this._contests.get(contestName);
		const apiPath = vscode.workspace.getConfiguration().get<string>('boca.api.path');
		const accessToken = this.context.globalState.get<string>('accessToken');
		try {
			const response = await axios<Array<Problem>>({
				method: 'get',
				url: apiPath + '/contest/' + contestNumber + '/problem',
				headers: {
					authorization: 'Bearer ' + accessToken
				}
			});
			for (let problem of (response.data || [])) {
				if (!problem.fake) {
					problem.problemuri = vscode.Uri.file(path.join(this._workspaceFolder.uri.fsPath, contestName, problem.problemname));
					contest?.problems.set(problem.problemname, { problem, runs: new Map() });
					await this._getRuns(contestNumber, contestName, problem.problemnumber, problem.problemname);
					const runs = contest?.problems.get(problem.problemname)?.runs;
					const solved = [...(runs!.values() || [])].some(run => run.runanswer === 1);
					treeFileDecorationProvider.updateProblemDecorator(problem.problemuri, solved, problem.problemcolorname!.toLowerCase());
				}
			}
		} catch (error) {
			vscode.window.showErrorMessage('Fetching problems failed');
			console.error(error);
		}
	}

	private async _downloadProblemFile(uri: vscode.Uri, problem: Problem): Promise<void> {
		if (problem?.probleminputfilename) {
			const fileUri = path.join(uri.fsPath, problem.probleminputfilename);
			if (fs.existsSync(fileUri)) {
				const stat = fs.statSync(fileUri);
				if (stat.isFile()) {
					return;
				}
			}
		}
		const apiPath = vscode.workspace.getConfiguration().get<string>('boca.api.path');
		const accessToken = this.context.globalState.get<string>('accessToken');
		const tempFolderPath = path.join(this._folderPath, problem.contestnumber.toString(), problem.problemname, 'temp');
		await this.createDirectory(vscode.Uri.file(tempFolderPath));
		const tempFilePath = path.join(tempFolderPath, 'temp.zip');
		const descriptionFolderPath = path.join(tempFolderPath, 'description');
		const writer = fs.createWriteStream(tempFilePath);
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
				const problemInfoPath = path.join(descriptionFolderPath, 'problem.info');
				const content = fs.readFileSync(problemInfoPath, { encoding: 'utf8' });
				const match = content.match(/descfile=([\w_\.]+)\n?$/); // TODO: verificar possíveis caracteres
				if (!match) {
					throw new Error('Missing descfile');
				}
				fs.renameSync(path.join(descriptionFolderPath, match[1]), path.join(uri.fsPath, match[1]));
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

	private async _getRuns(contestNumber: number, contestName: string, problemNumber: number, problemName: string): Promise<void> {
		const contest = this._contests.get(contestName);
		const problem = contest?.problems.get(problemName);
		const apiPath = vscode.workspace.getConfiguration().get<string>('boca.api.path');
		const accessToken = this.context.globalState.get<string>('accessToken');
		try {
			const response = await axios<Array<Run>>({
				method: 'get',
				url: apiPath + '/contest/' + contestNumber + '/problem/' + problemNumber + '/run',
				headers: {
					authorization: 'Bearer ' + accessToken
				}
			});
			for (let run of (response.data || [])) {
				problem?.runs.set(run.runnumber, run);
			}
		} catch (error) {
			vscode.window.showErrorMessage('Fetching runs failed');
			console.error(error);
		}
	}
}

interface Contest {
	contestnumber: number;
	contestname: string;
	contestmainsite: number;
	conteststartdate: number;
	contesturi?: vscode.Uri;
}

interface Problem {
	contestnumber: number;
	problemnumber: number;
	problemname: string;
	probleminputfilename?: string,
	fake: boolean;
	problemcolorname?: string;
	problemcolor?: string;
	problemuri?: vscode.Uri;
}

interface Run {
	runnumber: number;
	usernumber: number;
	runanswer: number;
	runanswer1: number;
	runanswer2: number;
}
