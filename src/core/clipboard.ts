import * as vscode from "vscode";

export async function copyToClipboard(text: string): Promise<void> {
  await vscode.env.clipboard.writeText(text);
}

export async function readClipboard(): Promise<string> {
  return vscode.env.clipboard.readText();
}
