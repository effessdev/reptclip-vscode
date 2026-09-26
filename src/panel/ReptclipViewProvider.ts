import * as vscode from "vscode";
import { getHtml } from "./getHtml";
import { loadProjectState, saveProjectState } from "../core/projectStorage";
import { generateContext } from "../core/generateContext";
import { copyToClipboard, readClipboard } from "../core/clipboard";
import { applyDiffs } from "../core/diffApplier";
import { writeOutputFile } from "../core/outputWriter";
import { collectCandidates, filterCandidates } from "../core/completions";
import { collectNonIgnoredFiles } from "../core/gitignoreScanner";
import { tokenize } from "../core/tokenizer";
import { matchesAnyFile } from "../core/patternMatcher";
import {
  defaultUiState,
  HostToWebviewMessage,
  WebviewToHostMessage,
} from "../core/types";

export class ReptclipViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "reptclip.panelView";

  /** Cached workspace path list used for autocomplete; built on first use. */
  private candidates?: Promise<string[]>;

  /** Cached non-gitignored file list used for token highlighting. */
  private files?: Promise<string[]>;

  /** Last highlight evaluation, replayed whenever the file list changes. */
  private lastHighlight?: {
    requestId: number;
    include: string;
    exclude: string;
  };

  /** Watches the workspace so the cached file list stays fresh. */
  private fileWatcher?: vscode.FileSystemWatcher;

  /** Debounce timer coalescing bursts of filesystem events. */
  private fileChangeTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "webview-ui"),
      ],
    };
    webviewView.webview.html = getHtml(webviewView.webview, this.extensionUri);

    const post = (message: HostToWebviewMessage) =>
      webviewView.webview.postMessage(message);

    const rootDir = this.getRootDir();
    const state = rootDir
      ? loadProjectState(this.context, rootDir)
      : defaultUiState();
    post({ type: "init", state, hasWorkspace: !!rootDir });

    // Computes match flags for every include/exclude token against the current
    // file list. Shared by the live request and the filesystem watcher below.
    const evaluateHighlight = async (
      requestId: number,
      include: string,
      exclude: string,
    ) => {
      if (!rootDir) {
        return;
      }
      this.files ??= collectNonIgnoredFiles(rootDir);
      const files = await this.files;
      post({
        type: "highlightResult",
        requestId,
        include: tokenize(include).map((p) => matchesAnyFile(files, p)),
        exclude: tokenize(exclude).map((p) => matchesAnyFile(files, p)),
      });
    };

    // The cached file list goes stale the moment a file is created/deleted,
    // so watch the workspace, drop the cache, and re-evaluate the patterns
    // already in the boxes — that is what makes colors update in real time.
    if (rootDir) {
      this.fileWatcher?.dispose();
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(rootDir), "**/*"),
      );
      const scheduleRefresh = () => {
        if (this.fileChangeTimer) {
          clearTimeout(this.fileChangeTimer);
        }
        this.fileChangeTimer = setTimeout(() => {
          this.files = undefined; // force a fresh scan on the next evaluation
          if (this.lastHighlight) {
            void evaluateHighlight(
              this.lastHighlight.requestId,
              this.lastHighlight.include,
              this.lastHighlight.exclude,
            );
          }
        }, 200);
      };
      watcher.onDidCreate(scheduleRefresh);
      watcher.onDidChange(scheduleRefresh);
      watcher.onDidDelete(scheduleRefresh);
      this.fileWatcher = watcher;
      webviewView.onDidDispose(() => {
        watcher.dispose();
        if (this.fileWatcher === watcher) {
          this.fileWatcher = undefined;
        }
      });
    }

    webviewView.webview.onDidReceiveMessage(
      async (message: WebviewToHostMessage) => {
        switch (message.type) {
          case "stateChanged": {
            if (rootDir) {
              await saveProjectState(this.context, rootDir, message.state);
            }
            return;
          }

          case "suggest": {
            if (!rootDir) {
              return;
            }
            this.candidates ??= collectCandidates(rootDir);
            const candidates = await this.candidates;
            post({
              type: "suggestResult",
              requestId: message.requestId,
              items: filterCandidates(candidates, message.prefix),
            });
            return;
          }

          case "highlight": {
            if (!rootDir) {
              return;
            }
            this.lastHighlight = {
              requestId: message.requestId,
              include: message.include,
              exclude: message.exclude,
            };
            await evaluateHighlight(
              message.requestId,
              message.include,
              message.exclude,
            );
            return;
          }

          case "run": {
            if (!rootDir) {
              vscode.window.showWarningMessage(
                "ReptClip: open a folder first.",
              );
              return;
            }

            await saveProjectState(this.context, rootDir, message.state);

            try {
              const result = await generateContext(rootDir, message.state);

              if (message.state.clipboard) {
                await copyToClipboard(result.markdown);
              }
              if (message.state.outputFile.trim()) {
                await writeOutputFile(
                  rootDir,
                  message.state.outputFile,
                  result.markdown,
                );
              }

              post({
                type: "runResult",
                ok: true,
                fileCount: result.includedFiles.length,
              });
              vscode.window.setStatusBarMessage(
                `ReptClip: included ${result.includedFiles.length} file(s)`,
                3000,
              );
            } catch (err) {
              const message_ = err instanceof Error ? err.message : String(err);
              vscode.window.showErrorMessage(`ReptClip failed: ${message_}`);
              post({ type: "runResult", ok: false, error: message_ });
            }
            return;
          }

          case "applyDiffs": {
            if (!rootDir) {
              vscode.window.showWarningMessage(
                "ReptClip: open a folder first.",
              );
              return;
            }

            try {
              const clipboardText = await readClipboard();
              if (!clipboardText.trim()) {
                throw new Error(
                  "Clipboard is empty — copy a Search/Replace diff first.",
                );
              }
              const summary = await applyDiffs(rootDir, clipboardText);

              post({ type: "applyResult", ok: true, ...summary });
              vscode.window.setStatusBarMessage(
                `ReptClip: applied diffs — ${summary.modified} modified, ${summary.created} created, ${summary.deleted} deleted`,
                4000,
              );
            } catch (err) {
              const message_ = err instanceof Error ? err.message : String(err);
              vscode.window.showErrorMessage(`ReptClip: ${message_}`);
              post({ type: "applyResult", ok: false, error: message_ });
            }
            return;
          }
        }
      },
    );
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
