import * as vscode from 'vscode';
import * as path from 'path';
import axios from 'axios';

export class ContestProvider implements vscode.TreeDataProvider<Contest> {

	private _onDidChangeTreeData: vscode.EventEmitter<Contest | undefined | void> = new vscode.EventEmitter<Contest | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Contest | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext, private workspaceRoot: string | undefined) {
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Contest): vscode.TreeItem {
		return element;
	}

	getChildren(): Thenable<Contest[]> {
		if (!this.workspaceRoot) {
			vscode.window.showInformationMessage('No contest in empty workspace');
			return Promise.resolve([]);
		}

		return Promise.resolve(this._getContests());
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
			return (response.data || []).filter((contest: any) => contest.contestnumber !== 0).map((contest: any) => this._toContest(contest));
		} catch (error: any) {
			if (error.response.status === 401) {
				return vscode.commands.executeCommand('setContext', 'boca.showSignInView', true);
			}
			vscode.window.showErrorMessage('Fetching contests failed');
			console.error(error);
			return [];
		}
	}

	private _toContest(contest: any) {
		return new Contest(contest.contestname, '', vscode.TreeItemCollapsibleState.None, {
			command: 'bocaExplorer.selectContest',
			title: 'Select Contest',
			arguments: [contest.contestnumber]
		});
	}
}

export class Contest extends vscode.TreeItem {

	constructor(
		public readonly label: string,
		private readonly languages: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super(label, collapsibleState);

		this.tooltip = this.label;
		this.description = this.languages;
	}

	iconPath = {
		light: path.join(__filename, '..', '..', 'resources', 'light', 'contest.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'dark', 'contest.svg')
	};

	contextValue = 'contest';
}
