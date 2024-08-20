import * as vscode from 'vscode';
import * as path from 'path';

import { AuthProvider } from './auth';
import { Entry, BocaTreeProvider } from './bocaTree';
import { RunProvider } from './run';

export async function activate(context: vscode.ExtensionContext) {
	vscode.commands.registerCommand(
		'boca.openApiUriSetting',
		() => vscode.commands.executeCommand('workbench.action.openSettings', 'boca.api.uri')
	);
	vscode.commands.registerCommand(
		'boca.openApiSaltSetting',
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
	vscode.commands.registerCommand('boca.signIn', async () => {
		const accessToken = await authProvider.signIn();
		context.globalState.update('accessToken', accessToken);
		bocaTreeProvider.refresh();
	});
	vscode.commands.registerCommand('boca.signOut', async () => {
		context.globalState.update('accessToken', null);
		await vscode.commands.executeCommand('setContext', 'boca.showSignInView', true);
	});

	vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('boca.api')) {
			const { uri: apiUri, salt: apiSalt } = vscode.workspace.getConfiguration().get<any>('boca.api');
			if (!!apiUri && !!apiSalt) {
				bocaTreeProvider.refresh();
			}
		}
	});

	const bocaTreeProvider = new BocaTreeProvider(context);
	if (hasAccessToken) {
		await bocaTreeProvider.refresh();
	}
	vscode.window.registerTreeDataProvider('bocaTree', bocaTreeProvider);
	vscode.commands.registerCommand('boca.refreshEntry', () => bocaTreeProvider.refresh());
	vscode.commands.registerCommand('boca.synchronizeAll', () => bocaTreeProvider.synchronize());
	vscode.commands.registerCommand('boca.synchronize', (entry?: Entry) => bocaTreeProvider.synchronize(entry));

	const runProvider = new RunProvider(context);
	vscode.window.registerTreeDataProvider('runs', runProvider);
	
	vscode.commands.registerCommand('boca.selectProblem', async (resource: vscode.Uri) => {
		const { base: problemName, dir } = path.parse(resource.fsPath);
		const contestName = path.parse(dir).base;
		const contestNumber = bocaTreeProvider.getContestNumber(contestName);
		const problemNumber = bocaTreeProvider.getProblemNumber(contestName, problemName);
		await runProvider.refresh(contestNumber, problemNumber);
	});
	
	vscode.commands.registerCommand('boca.submitRun', (resource: vscode.Uri) => {
		bocaTreeProvider.submitRun(resource);
	});
	
	vscode.commands.registerCommand('runs.selectRun', (resource: vscode.Uri, message: string) => {
		vscode.window.showTextDocument(resource);
		outputChannel.appendLine(message);
		outputChannel.show();
	});
}

export function deactivate() {}
