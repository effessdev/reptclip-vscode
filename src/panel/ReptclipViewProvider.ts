import * as vscode from 'vscode';
import { getHtml } from './getHtml';
import { loadProjectState, saveProjectState } from '../core/projectStorage';
import { generateContext } from '../core/generateContext';
import { copyToClipboard } from '../core/clipboard';
import { writeOutputFile } from '../core/outputWriter';
import { defaultUiState, HostToWebviewMessage, WebviewToHostMessage } from '../core/types';

export class ReptclipViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'reptclip.panelView';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'webview-ui')],
    };
    webviewView.webview.html = getHtml(webviewView.webview, this.extensionUri);

    const post = (message: HostToWebviewMessage) => webviewView.webview.postMessage(message);

    const rootDir = this.getRootDir();
    const state = rootDir ? loadProjectState(this.context, rootDir) : defaultUiState();
    post({ type: 'init', state, hasWorkspace: !!rootDir });

    webviewView.webview.onDidReceiveMessage(async (message: WebviewToHostMessage) => {
      switch (message.type) {
        case 'stateChanged': {
          if (rootDir) {
            await saveProjectState(this.context, rootDir, message.state);
          }
          return;
        }

        case 'run': {
          if (!rootDir) {
            vscode.window.showWarningMessage('ReptClip: open a folder first.');
            return;
          }

          await saveProjectState(this.context, rootDir, message.state);

          try {
            const result = await generateContext(rootDir, message.state);

            if (message.state.clipboard) {
              await copyToClipboard(result.markdown);
            }
            if (message.state.outputFile.trim()) {
              await writeOutputFile(rootDir, message.state.outputFile, result.markdown);
            }

            post({ type: 'runResult', ok: true, fileCount: result.includedFiles.length });
            vscode.window.setStatusBarMessage(
              `ReptClip: included ${result.includedFiles.length} file(s)`,
              3000
            );
          } catch (err) {
            const message_ = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`ReptClip failed: ${message_}`);
            post({ type: 'runResult', ok: false, error: message_ });
          }
          return;
        }
      }
    });
  }

  /**
   * Resolves the "current project" as the workspace folder containing the
   * active editor, falling back to the first open workspace folder.
   */
  private getRootDir(): string | undefined {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri) {
      const folder = vscode.workspace.getWorkspaceFolder(activeUri);
      if (folder) {
        return folder.uri.fsPath;
      }
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
}
