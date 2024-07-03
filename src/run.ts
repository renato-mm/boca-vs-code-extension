import * as vscode from 'vscode';
import * as path from 'path';
import axios from 'axios';
import { treeFileDecorationProvider } from './treeFileDecorationProvider';

export class RunProvider implements vscode.TreeDataProvider<RunTreeItem> {
	private _folderUri: vscode.Uri;
	private _contestsAnswers: Map<number, Array<Answer>>;
	private _contestNumber = 0;
	private _problemNumber = 0;
	private _onDidChangeTreeData: vscode.EventEmitter<RunTreeItem | undefined | void> = new vscode.EventEmitter<RunTreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<RunTreeItem | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext) {
		this._folderUri = vscode.Uri.file(path.join(context.storageUri!.fsPath, '..', 'boca-extension'));
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
			return (response.data || [])
				.sort((r1, r2) => r1.rundate - r2.rundate)
				.map((run) => {
					const answer = this._contestsAnswers.get(this._contestNumber)?.find(ans => ans.answernumber === run.runanswer);
					return new RunTreeItem(run, this._folderUri.fsPath, answer);
				});
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
}

export class RunTreeItem extends vscode.TreeItem {
	constructor(run: Run, folderPath: string, answer?: Answer) {
		const label = `${run.runnumber} - ${run.runfilename}`;
		super(label, vscode.TreeItemCollapsibleState.None);

		this.tooltip = label;
		this.description = answer?.runanswer || '';
		this.resourceUri = vscode.Uri.file(path.join(folderPath, 'Runs', run.runnumber.toString(), run.runfilename));
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
	runsitenumber: number;
	runnumber: number;
	usernumber: number;
	rundate: number;
	rundatediff: number;
	rundatediffans: number;
	runproblem: number;
	runfilename: string;
	rundata: number;
	runanswer: number;
	runstatus: string;
	runjudge?: number;
	runjudgesite?: number;
	runanswer1: number;
	runjudge1?: number;
	runjudgesite1?: number;
	runanswer2: number;
	runjudge2?: number;
	runjudgesite2?: number;
	runlangnumber: number;
	autoip?: string;
	autobegindate?: number;
	autoenddate?: number;
	autoanswer?: string;
	autostdout?: number;
	autostderr?: number;
	updatetime: number;
}

interface Answer {
	contestnumber: number;
	answernumber: number;
	runanswer: string;
	yes: boolean;
	fake: boolean;
  updatetime: number;
}
