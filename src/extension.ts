import * as vscode from 'vscode';
import { ReptclipViewProvider } from './panel/ReptclipViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ReptclipViewProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ReptclipViewProvider.viewType, provider)
  );
}

export function deactivate(): void {
  // Nothing to clean up — no timers, watchers, or open handles are kept.
}
