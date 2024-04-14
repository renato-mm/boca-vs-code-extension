import {
	FileDecorationProvider,
	FileDecoration,
	Uri,
	EventEmitter,
	Event,
	CancellationToken,
	ProviderResult,
	Disposable,
	window,
	ThemeColor
} from "vscode";

class TreeFileDecorationProvider implements FileDecorationProvider {
	private _disposables: Array<Disposable> = [];
	private _fileDecorations: Map<string, FileDecoration> = new Map<string, FileDecoration>();

	constructor() {
    this._disposables = [];
    this._disposables.push(window.registerFileDecorationProvider(this));
  }

	updateProblemDecorator(resourceUri: Uri, solved: boolean, color: string): void {
		const decorator: FileDecoration = {
			badge: solved ? '⚑' : '⚐',
			color: new ThemeColor(`bocaExplorer.${color}`)
		};
		const currrentDecorator = this._fileDecorations.get(resourceUri.toString());
		if (currrentDecorator?.badge !== decorator.badge) {
			this._fileDecorations.set(resourceUri.toString(), decorator);
			this._onDidChangeFileDecorations.fire(resourceUri);
		}
	}

	updateRunDecorator(resourceUri: Uri, solved: boolean, tooltip: string): void {
		const decorator: FileDecoration = solved
			? {
				badge: '✓',
				color: new ThemeColor('runs.correctAnswer'),
				tooltip
			}
			: {
				badge: '☓',
				color: new ThemeColor('runs.incorrectAnswer'),
				tooltip
			};
		const currrentDecorator = this._fileDecorations.get(resourceUri.toString());
		if (currrentDecorator?.badge !== decorator.badge) {
			this._fileDecorations.set(resourceUri.toString(), decorator);
			this._onDidChangeFileDecorations.fire(resourceUri);
		}
	}

	_onDidChangeFileDecorations: EventEmitter<Uri | Uri[]> = new EventEmitter<Uri | Uri[]>();
	onDidChangeFileDecorations: Event<Uri | Uri[]> = this._onDidChangeFileDecorations.event;

	provideFileDecoration(uri: Uri, _token: CancellationToken): ProviderResult<FileDecoration> {
		return this._fileDecorations.get(uri.toString());
	}

  dispose() {
    this._disposables.forEach((d) => d.dispose());
  }
}

export const treeFileDecorationProvider = new TreeFileDecorationProvider();
