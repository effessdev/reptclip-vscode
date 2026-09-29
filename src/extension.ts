import * as vscode from "vscode";
import { ReptclipViewProvider } from "./panel/ReptclipViewProvider";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ReptclipViewProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ReptclipViewProvider.viewType,
      provider,
      {
        // Keep the webview alive when the user switches to another tab in the
        // bottom panel (Terminal, Output, ...). Without this the view's context
        // is destroyed on hide and the panel comes back empty of unsaved edits.
        webviewOptions: { retainContextWhenHidden: true },
      },
    ),
  );
}

export function deactivate(): void {
  // Nothing to clean up — no timers, watchers, or open handles are kept.
}
