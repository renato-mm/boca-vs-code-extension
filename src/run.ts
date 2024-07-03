import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as stream from 'stream';
import { promisify } from 'util';
import { treeFileDecorationProvider } from './treeFileDecorationProvider';

const finished = promisify(stream.finished);

export class RunProvider implements vscode.TreeDataProvider<RunTreeItem> {
	private _folderPath: string;
	private _contestsAnswers: Map<number, Array<Answer>>;
	private _contestNumber = 0;
	private _problemNumber = 0;
	private _onDidChangeTreeData: vscode.EventEmitter<RunTreeItem | undefined | void> = new vscode.EventEmitter<RunTreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<RunTreeItem | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext) {
		this._folderPath = path.join(context.storageUri!.fsPath, '..', 'boca-extension');
		const runsPath = path.join(this._folderPath, 'Runs');
		if (!fs.existsSync(runsPath)) {
			fs.mkdirSync(runsPath, { recursive: true });
		}
		this._contestsAnswers = new Map();
	}

	async refresh(contestNumber: number, problemNumber: number) {
		this._contestNumber = contestNumber;
		this._problemNumber = problemNumber;
		await this._getAnswers();
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: RunTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): Thenable<RunTreeItem[]> {
		return Promise.resolve(this._getRuns());
	}

	private async _getRuns(): Promise<RunTreeItem[]> {
		if (this._contestNumber === 0 || this._problemNumber === 0) {
			return [];
		}
		const apiPath = vscode.workspace.getConfiguration().get<string>('boca.api.path');
		const accessToken = this.context.globalState.get<string>('accessToken');
		try {
			const response = await axios<Array<Run>>({
				method: 'get',
				url: apiPath + '/contest/' + this._contestNumber + '/problem/' + this._problemNumber + '/run',
				headers: {
					authorization: 'Bearer ' + accessToken
				}
			});
			const orderedRuns = (response.data || []).sort((r1, r2) => r1.rundate - r2.rundate);
			const runs: RunTreeItem[] = [];
			for (let run of orderedRuns) {
				const answer = this._contestsAnswers.get(this._contestNumber)?.find(ans => ans.answernumber === run.runanswer);
				const runFolderPath = path.join(this._folderPath, 'Runs', run.runnumber.toString());
				const runUri = vscode.Uri.file(path.join(runFolderPath, run.runfilename));
				if (!fs.existsSync(runUri.fsPath)) {
					fs.mkdirSync(runFolderPath, { recursive: true });
					await this._downloadRunFile(run, runFolderPath);
				}
				runs.push(new RunTreeItem(run, runUri, answer));
			}
			return runs;
		} catch (error) {
			vscode.window.showErrorMessage('Fetching runs failed');
			console.error(error);
			return [];
		}
	}

	private async _getAnswers() {
		const apiPath = vscode.workspace.getConfiguration().get<string>('boca.api.path');
		const accessToken = this.context.globalState.get<string>('accessToken');
		try {
			const response = await axios<Array<Answer>>({
				method: 'get',
				url: apiPath + '/contest/' + this._contestNumber + '/answer',
				headers: {
					authorization: 'Bearer ' + accessToken
				}
			});
			this._contestsAnswers.set(this._contestNumber, response.data || []);
		} catch (error) {
			vscode.window.showErrorMessage('Fetching answers failed');
			console.error(error);
		}
	}

	private async _downloadRunFile(run: Run, runFolderPath: string): Promise<void> {
		const apiPath = vscode.workspace.getConfiguration().get<string>('boca.api.path');
		const accessToken = this.context.globalState.get<string>('accessToken');
		const runFilePath = path.join(runFolderPath, run.runfilename);
		const writer = fs.createWriteStream(runFilePath);
		return new Promise((resolve, reject) => {
			axios({
				method: 'get',
				url: apiPath + '/contest/' + run.contestnumber + '/problem/' + run.runproblem + '/run/' + run.runnumber + '/file',
				responseType: 'stream',
				headers: {
					authorization: 'Bearer ' + accessToken
				}
			}).then(response => {
				response.data.pipe(writer);
				return finished(writer);
			}).then(_ => {
				resolve();
			}).catch(error => {
				vscode.window.showErrorMessage('Error downloading run');
				console.error(error);
				fs.rmSync(runFolderPath, { recursive: true, force: true });
				reject();
			});
    });
	}
}

export class RunTreeItem extends vscode.TreeItem {
	constructor(run: Run, uri: vscode.Uri, answer?: Answer) {
		const label = `${run.runnumber} - ${run.runfilename}`;
		super(label, vscode.TreeItemCollapsibleState.None);

		this.tooltip = label;
		this.description = answer?.runanswer || '';
		this.resourceUri = uri;
		const message = `Run ${run.runnumber} - ${this.description}`;
		this.command = { command: 'runs.selectRun', title: "Select Run", arguments: [this.resourceUri, message] };
		treeFileDecorationProvider.updateRunDecorator(this.resourceUri, run.runanswer === 1, this.description);
	}

	iconPath = {
		light: path.join(__filename, '..', '..', 'resources', 'light', 'run.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'dark', 'run.svg')
	};

	contextValue = 'run';
}

interface Run {
	contestnumber: number;
	runnumber: number;
	runproblem: number;
	rundate: number;
	runfilename: string;
	runanswer: number;
	runanswer1: number;
	runanswer2: number;
}

interface Answer {
	contestnumber: number;
	answernumber: number;
	runanswer: string;
	yes: boolean;
	fake: boolean;
  updatetime: number;
}
