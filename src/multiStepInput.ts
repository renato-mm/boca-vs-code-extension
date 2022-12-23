/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	QuickPickItem,
	window,
	Disposable,
	QuickInputButton,
	QuickInput,
	QuickInputButtons
} from 'vscode';
import axios from 'axios';

/**
 * A multi-step input using window.createQuickPick() and window.createInputBox().
 * 
 * This first part uses the helper class `MultiStepInput` that wraps the API for the multi-step case.
 */
export async function multiStepInput() {
	const title = 'Submit Run';

	const state = await collectInputs(title);

	return state;
}

interface ContestQuickPickItem extends QuickPickItem {
	contestId: string;
}

interface ProblemQuickPickItem extends QuickPickItem {
	problemId: string;
}

interface State {
	title: string;
	step: number;
	totalSteps: number;
	contest: ContestQuickPickItem;
	problem: ProblemQuickPickItem;
}

async function collectInputs(title: string) {
	const state = {} as Partial<State>;
	await MultiStepInput.run(input => pickContest(title, input, state));
	return state as State;
}

async function pickContest(title: string, input: MultiStepInput, state: Partial<State>) {
	const contests = await getContests();
	const pick = await input.showQuickPick<ContestQuickPickItem, QuickPickParameters<ContestQuickPickItem>>({
		title,
		step: 1,
		totalSteps: 2,
		placeholder: 'Pick a contest',
		items: contests,
		activeItem: typeof state.contest !== 'string' ? state.contest : undefined,
		shouldResume: shouldResume
	});
	state.contest = pick;
	return (input: MultiStepInput) => pickProblem(title, input, state);
}

async function pickProblem(title: string, input: MultiStepInput, state: Partial<State>) {
	const problems = await getProblems(state.contest!.contestId);
	state.problem = await input.showQuickPick<ProblemQuickPickItem, QuickPickParameters<ProblemQuickPickItem>>({
		title,
		step: 2,
		totalSteps: 2,
		placeholder: 'Pick a problem',
		items: problems,
		activeItem: state.problem,
		shouldResume: shouldResume
	});
}

function shouldResume() {
	// Could show a notification with the option to resume.
	return new Promise<boolean>((resolve, reject) => {
		// noop
	});
}

async function getContests(): Promise<ContestQuickPickItem[]> {
	const apiAddress = process.env.apiAddress;
	try {
		const response = await axios({
			method: 'get',
			url: apiAddress + '/contests',
		});
		return (response.data || [])
			.filter((contest: any) => contest.contestnumber !== 0)
			.map((contest: any) => ({ label: contest.contestname, contestId: contest.contestnumber }));
	} catch (error) {
		console.log(error);
		return [];
	}
}

async function getProblems(contestId: string): Promise<ProblemQuickPickItem[]> {
	const apiAddress = process.env.apiAddress;
	try {
		const response = await axios({
			method: 'get',
			url: apiAddress + '/contest/' + contestId + '/problem',
		});
		return (response.data || [])
			.filter((problem: any) => !problem.fake)
			.map((problem: any) => ({ label: problem.problemname, problemId: problem.problemnumber }));
	} catch (error) {
		console.log(error);
		return [];
	}
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

interface QuickPickParameters<T extends QuickPickItem> {
	title: string;
	step: number;
	totalSteps: number;
	items: T[];
	activeItem?: T;
	placeholder: string;
	buttons?: QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

interface InputBoxParameters {
	title: string;
	step: number;
	totalSteps: number;
	value: string;
	prompt: string;
	validate: (value: string) => Promise<string | undefined>;
	buttons?: QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
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

	async showQuickPick<T extends QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<T | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createQuickPick<T>();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.placeholder = placeholder;
				input.items = items;
				if (activeItem) {
					input.activeItems = [activeItem];
				}
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidChangeSelection(items => resolve(items[0])),
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

	async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createInputBox();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.value = value || '';
				input.prompt = prompt;
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
