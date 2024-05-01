import * as vscode from 'vscode';

import { ContestProvider, Contest } from './contest';
import { ProblemProvider, Problem } from './problem';
import { RunProvider, Run } from './run';
import { AuthProvider } from './auth';

export async function activate(context: vscode.ExtensionContext) {
	vscode.commands.registerCommand(
		'bocaExplorer.openApiPathSetting',
		() => vscode.commands.executeCommand('workbench.action.openSettings', 'boca.api.path')
	);
	vscode.commands.registerCommand(
		'bocaExplorer.openApiSaltSetting',
		() => vscode.commands.executeCommand('workbench.action.openSettings', 'boca.api.salt')
	);
	// Overwrite entire parent setting
	vscode.workspace.getConfiguration().update(
		'explorer.decorations.colors',
		false,
		vscode.ConfigurationTarget.Global
	);
	const hasAccessToken = !!context.globalState.get<string>('accessToken');
	await vscode.commands.executeCommand('setContext', 'boca.showSignInView', hasAccessToken);

	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

	const contestProvider = new ContestProvider(context, rootPath);
	vscode.window.registerTreeDataProvider('bocaExplorer', contestProvider);
	vscode.commands.registerCommand('bocaExplorer.fetchContests', () => contestProvider.refresh());
	vscode.commands.registerCommand('bocaExplorer.refreshEntry', () => contestProvider.refresh());
	vscode.commands.registerCommand('bocaExplorer.addEntry', () => vscode.window.showInformationMessage(`Successfully called add entry.`));
	vscode.commands.registerCommand('bocaExplorer.editEntry', (contest: Contest) => vscode.window.showInformationMessage(`Successfully called edit entry on ${contest.label}.`));
	vscode.commands.registerCommand('bocaExplorer.deleteEntry', (contest: Contest) => vscode.window.showInformationMessage(`Successfully called delete entry on ${contest.label}.`));

	const problemProvider = new ProblemProvider(context, rootPath);

	const runProvider = new RunProvider(context, rootPath);
	vscode.window.registerTreeDataProvider('runs', runProvider);
	
	vscode.commands.registerCommand('bocaExplorer.selectContest', contestNumber => {
		problemProvider.refresh(contestNumber);
	});
	vscode.commands.registerCommand('bocaExplorer.selectProblem', problemNumber => {
		runProvider.refresh(problemNumber);
	});
	vscode.commands.registerCommand('bocaExplorer.downloadProblem', (problem: Problem) => {
		problemProvider.downloadProblemToWorkspace(problem);
	});

	const authProvider = new AuthProvider();
	vscode.commands.registerCommand('bocaExplorer.signIn', async () => {
		const accessToken = await authProvider.signIn();
		context.globalState.update('accessToken', accessToken);
		contestProvider.refresh();
	});
}

export function deactivate() {}
