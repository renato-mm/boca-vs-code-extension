import * as vscode from 'vscode';

import { ContestProvider, Contest } from './contest';
import { ProblemProvider, Problem } from './problem';
import { RunProvider, Run } from './run';

export function activate(context: vscode.ExtensionContext) {
	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

	const contestProvider = new ContestProvider(rootPath);
	vscode.window.registerTreeDataProvider('contests', contestProvider);
	vscode.commands.registerCommand('contests.fetchContests', () => contestProvider.refresh());
	vscode.commands.registerCommand('contests.refreshEntry', () => contestProvider.refresh());
	vscode.commands.registerCommand('contests.addEntry', () => vscode.window.showInformationMessage(`Successfully called add entry.`));
	vscode.commands.registerCommand('contests.editEntry', (contest: Contest) => vscode.window.showInformationMessage(`Successfully called edit entry on ${contest.label}.`));
	vscode.commands.registerCommand('contests.deleteEntry', (contest: Contest) => vscode.window.showInformationMessage(`Successfully called delete entry on ${contest.label}.`));

	const problemProvider = new ProblemProvider(rootPath);
	vscode.window.registerTreeDataProvider('problems', problemProvider);

	const runProvider = new RunProvider(rootPath);
	vscode.window.registerTreeDataProvider('runs', runProvider);
	
	vscode.commands.registerCommand('contests.selectContest', contestNumber => {
		problemProvider.refresh(contestNumber);
	});
	vscode.commands.registerCommand('problems.selectProblem', problemNumber => {
		runProvider.refresh(problemNumber);
	});
	vscode.commands.registerCommand('problems.downloadProblem', (problem: Problem) => {
		problemProvider.downloadProblemToWorkspace(problem);
	});
}

export function deactivate() {}
