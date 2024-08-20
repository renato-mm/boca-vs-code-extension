import axios from 'axios';
import { createHash } from 'crypto';
import {
	commands,
	window,
	workspace,
	Disposable,
	QuickInputButton,
	QuickInput,
	QuickInputButtons
} from 'vscode';

export class AuthProvider {
	async signIn(): Promise<string> {
		const title = 'Sign In To BOCA';
		const { username, password } = await collectInputs(title);
		const { uri: apiUri, salt: apiSalt } = workspace.getConfiguration().get<any>('boca.api');
    const hashedPassword = createHash("sha256").update(password).digest("hex");
    const saltedPassword = createHash("sha256").update(hashedPassword + apiSalt).digest("hex");
		try {
			const response = await axios({
				method: 'get',
				url: `${apiUri}/token?name=${username}&password=${saltedPassword}`
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

interface State {
	title: string;
	step: number;
	totalSteps: number;
	username: string;
	password: string;
}

async function collectInputs(title: string) {
	const state = {} as Partial<State>;
	await MultiStepInput.run(input => enterUsername(title, input, state));
	return state as State;
}

async function enterUsername(title: string, input: MultiStepInput, state: Partial<State>) {
	state.username = await input.showInputBox({
		title,
		step: 1,
		totalSteps: 2,
		value: '',
		prompt: 'Enter username',
		validate: async (value: string) => undefined,
		shouldResume: shouldResume
	});
	return (input: MultiStepInput) => enterPassword(title, input, state);
}

async function enterPassword(title: string, input: MultiStepInput, state: Partial<State>) {
	state.password = await input.showInputBox({
		title,
		step: 2,
		totalSteps: 2,
		value: '',
		prompt: 'Enter password',
		validate: async (value: string) => undefined,
		shouldResume: shouldResume,
		password: true
	});
}

function shouldResume() {
	// Could show a notification with the option to resume.
	return new Promise<boolean>((resolve, reject) => {
		// noop
	});
}


// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------


class InputFlowAction {
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface InputBoxParameters {
	title: string;
	step: number;
	totalSteps: number;
	value: string;
	prompt: string;
	validate: (value: string) => Promise<string | undefined>;
	buttons?: QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
	password?: boolean;
}

class MultiStepInput {

	static async run<T>(start: InputStep) {
		const input = new MultiStepInput();
		return input.stepThrough(start);
	}

	private current?: QuickInput;
	private steps: InputStep[] = [];

	private async stepThrough<T>(start: InputStep) {
		let step: InputStep | void = start;
		while (step) {
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			try {
				step = await step(this);
			} catch (err) {
				if (err === InputFlowAction.back) {
					this.steps.pop();
					step = this.steps.pop();
				} else if (err === InputFlowAction.resume) {
					step = this.steps.pop();
				} else if (err === InputFlowAction.cancel) {
					step = undefined;
				} else {
					throw err;
				}
			}
		}
		if (this.current) {
			this.current.dispose();
		}
	}

	async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, shouldResume, password = false }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createInputBox();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.value = value || '';
				input.prompt = prompt;
				input.password = password;
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				let validating = validate('');
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidAccept(async () => {
						const value = input.value;
						input.enabled = false;
						input.busy = true;
						if (!(await validate(value))) {
							resolve(value);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async text => {
						const current = validate(text);
						validating = current;
						const validationMessage = await current;
						if (current === validating) {
							input.validationMessage = validationMessage;
						}
					}),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}
}
