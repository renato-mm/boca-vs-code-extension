import * as vscode from 'vscode';
import * as path from 'path';
import axios from 'axios';
import * as extract from 'extract-zip';
import { treeFileDecorationProvider } from './treeFileDecorationProvider';

export class ProblemProvider implements vscode.TreeDataProvider<Problem> {

	private _contestNumber = 0;
	private _onDidChangeTreeData: vscode.EventEmitter<Problem | undefined | void> = new vscode.EventEmitter<Problem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Problem | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext, private workspaceRoot: string | undefined) {
	}

	refresh(contestNumber: number): void {
		this._contestNumber = contestNumber;
		this._onDidChangeTreeData.fire();
	}

	async downloadProblemToWorkspace(problem: Problem): Promise<void> {
		const apiPath = vscode.workspace.getConfiguration().get<string>('boca.api.path');
		const accessToken = this.context.globalState.get<string>('accessToken');
		try {
			const response = await axios({
				method: 'get',
				url: apiPath + '/problem/' + problem.problemNumber + '/file',
				responseType: 'arraybuffer',
				headers: {
					authorization: 'Bearer ' + accessToken
				}
			});
			await extract(response.data, { dir: (this.workspaceRoot || '.') });
		} catch (error) {
			console.log(error);			
			await extract('/home/renato/test.zip', { dir: (this.workspaceRoot || '.') + '/' + problem.label });
		}
	}

	getTreeItem(element: Problem): vscode.TreeItem {
		return element;
	}

	getChildren(): Thenable<Problem[]> {
		if (!this.workspaceRoot) {
			vscode.window.showInformationMessage('No problem in empty workspace');
			return Promise.resolve([]);
		}

		return Promise.resolve(this._getProblems());
	}

	private async _getProblems(): Promise<Problem[]> {
		const apiPath = vscode.workspace.getConfiguration().get<string>('boca.api.path');
		const accessToken = this.context.globalState.get<string>('accessToken');
		try {
			const response = await axios({
				method: 'get',
				url: apiPath + '/contest/' + this._contestNumber + '/problem',
				headers: {
					authorization: 'Bearer ' + accessToken
				}
			});
			return (response.data || []).filter((problem: any) => !problem.fake).map((problem: any) => this._toProblem(problem));
		} catch (error) {
			vscode.window.showErrorMessage('Fetching problems failed');
			console.error(error);
			return [];
		}
	}

	private _toProblem(problem: any) {
		return new Problem(
			problem.problemnumber,
			problem.probleminputfilename,
			problem.problemname,
			!!Math.round(Math.random()),
			`${problem.contestnumber}@${problem.problemnumber}@${problem.problemname}`,
			problem.problemcolorname,
			vscode.TreeItemCollapsibleState.None,
			{
				command: 'bocaExplorer.selectProblem',
				title: 'Select Problem',
				arguments: [problem.problemnumber]
			}
		);
	}
}

export class Problem extends vscode.TreeItem {

	constructor(
		public readonly problemNumber: number,
		public readonly filename: string,
		public readonly label: string,
		success: boolean,
		uri: string,
		color: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super(label, collapsibleState);
		this.resourceUri = vscode.Uri.parse(uri);
		treeFileDecorationProvider.updateProblemDecorator(this.resourceUri, success, color);
	}

	iconPath = {
		light: path.join(__filename, '..', '..', 'resources', 'light', 'problem.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'dark', 'problem.svg')
	};

	contextValue = 'problem';
}
