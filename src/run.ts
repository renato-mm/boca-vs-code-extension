import * as vscode from 'vscode';
import * as path from 'path';
import axios from 'axios';
import { treeFileDecorationProvider } from './treeFileDecorationProvider';

export class RunProvider implements vscode.TreeDataProvider<Run> {

	private _problemNumber = 0;
	private _onDidChangeTreeData: vscode.EventEmitter<Run | undefined | void> = new vscode.EventEmitter<Run | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Run | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext, private workspaceRoot: string | undefined) {
	}

	refresh(problemNumber: number): void {
		this._problemNumber = problemNumber;
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Run): vscode.TreeItem {
		return element;
	}

	getChildren(): Thenable<Run[]> {
		if (!this.workspaceRoot) {
			vscode.window.showInformationMessage('No run in empty workspace');
			return Promise.resolve([]);
		}

		return Promise.resolve(this._getRuns());
	}

	private async _getRuns(): Promise<Run[]> {
		if (this._problemNumber === 0) {
			return [];
		}
		const apiPath = vscode.workspace.getConfiguration().get<string>('boca.api.path');
		const accessToken = this.context.globalState.get<string>('accessToken');
		try {
			const response = await axios({
				method: 'get',
				url: apiPath + '/problem/' + this._problemNumber + '/run',
				headers: {
					authorization: 'Bearer ' + accessToken
				}
			});
			return (response.data || [])
				.filter((run: any) => run.usernumber === 3151)
				.sort((r1: any, r2: any) => r1.rundate - r2.rundate)
				.map((run: any) => this._toRun(run));
		} catch (error) {
			vscode.window.showErrorMessage('Fetching runs failed');
			console.error(error);
			return [];
		}
	}

	private _toRun(run: any) {
		return new Run(
			run.runfilename,
			run.autoanswer.split(')').pop().trim(),
			run.runanswer === 1,
			`${run.contestnumber}@${run.runsitenumber}@${run.runnumber}`,
			vscode.TreeItemCollapsibleState.None
		);
	}
}

export class Run extends vscode.TreeItem {

	constructor(
		public readonly label: string,
		private readonly descriptionText: string,
		success: boolean,
		uri: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command,
	) {
		super(label, collapsibleState);

		this.description = this.descriptionText;
		this.resourceUri = vscode.Uri.parse(uri);
		this.tooltip = this.label;
		treeFileDecorationProvider.updateRunDecorator(this.resourceUri, success, this.description);
	}

	iconPath = {
		light: path.join(__filename, '..', '..', 'resources', 'light', 'run.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'dark', 'run.svg')
	};

	contextValue = 'run';
}
