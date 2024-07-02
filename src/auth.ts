import axios from 'axios';
import { createHash } from 'crypto';
import { commands, window, workspace } from 'vscode';
import { credentialsInput } from './credentialsInput';

export class AuthProvider {
	async signIn(): Promise<string> {
		const { username, password } = await credentialsInput();
		return await this.login(username, password);
	}

	async login(username: string, password: string): Promise<string> {
		const { path: apiPath, salt: apiSalt } = workspace.getConfiguration().get<any>('boca.api');
    const hashedPassword = createHash("sha256").update(password).digest("hex");
    const saltedPassword = createHash("sha256").update(hashedPassword + apiSalt).digest("hex");
		try {
			const response = await axios({
				method: 'get',
				url: `${apiPath}/token?name=${username}&password=${saltedPassword}`
			});
			commands.executeCommand('setContext', 'boca.showSignInView', false);
			return response.data.accessToken || '';
		} catch (error: any) {
			window.showErrorMessage('Login failed');
			console.error(error);
			return '';
		}
	}
}
