import * as vscode from 'vscode';
import * as path from 'path';

import { AuthProvider } from './auth';
import { Entry, FileSystemProvider } from './fileExplorer';
import { RunProvider } from './run';

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
	const outputChannel = vscode.window.createOutputChannel('BOCA');
	const hasAccessToken = !!context.globalState.get<string>('accessToken');
	await vscode.commands.executeCommand('setContext', 'boca.showSignInView', !hasAccessToken);

	const authProvider = new AuthProvider();
	vscode.commands.registerCommand('bocaExplorer.signIn', async () => {
		const accessToken = await authProvider.signIn();
		context.globalState.update('accessToken', accessToken);
		fileSystemProvider.refresh();
	});
	vscode.commands.registerCommand('bocaExplorer.signOut', async () => {
		context.globalState.update('accessToken', null);
		await vscode.commands.executeCommand('setContext', 'boca.showSignInView', true);
	});

	vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('boca.api')) {
			const { path: apiPath, salt: apiSalt } = vscode.workspace.getConfiguration().get<any>('boca.api');
			if (!!apiPath && !!apiSalt) {
				fileSystemProvider.refresh();
			}
		}
	});

	const fileSystemProvider = new FileSystemProvider(context);
	if (hasAccessToken) {
		await fileSystemProvider.refresh();
	}
	vscode.window.registerTreeDataProvider('bocaExplorer', fileSystemProvider);
	vscode.commands.registerCommand('bocaExplorer.refreshEntry', () => fileSystemProvider.refresh());
	vscode.commands.registerCommand('bocaExplorer.synchronizeAll', () => fileSystemProvider.synchronize());
	vscode.commands.registerCommand('bocaExplorer.synchronize', (entry?: Entry) => fileSystemProvider.synchronize(entry));

	const runProvider = new RunProvider(context);
	vscode.window.registerTreeDataProvider('runs', runProvider);
	
	vscode.commands.registerCommand('bocaExplorer.selectProblem', async (resource: vscode.Uri) => {
		const { base: problemName, dir } = path.parse(resource.fsPath);
		const contestName = path.parse(dir).base;
		const contestNumber = fileSystemProvider.getContestNumber(contestName);
		const problemNumber = fileSystemProvider.getProblemNumber(contestName, problemName);
		await runProvider.refresh(contestNumber, problemNumber);
	});
	
	vscode.commands.registerCommand('bocaExplorer.submitRun', (resource: vscode.Uri) => {
		fileSystemProvider.submitRun(resource);
	});
	
	vscode.commands.registerCommand('runs.selectRun', (resource: vscode.Uri, message: string) => {
		vscode.window.showTextDocument(resource);
		outputChannel.appendLine(message);
		outputChannel.show();
	});
}

export function deactivate() {}
