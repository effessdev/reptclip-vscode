import * as vscode from 'vscode';
import { UiState, defaultUiState } from './types';

const STORAGE_KEY = 'reptclip.projectStates';

type ProjectStateMap = Record<string, UiState>;

/**
 * State is keyed by the project's absolute filesystem path (not VS Code's
 * workspace identity), so it stays correct regardless of how a folder is
 * opened — standalone, as part of a multi-root workspace, etc. — and
 * persists across sessions via globalState.
 */
export function loadProjectState(context: vscode.ExtensionContext, rootDir: string): UiState {
  const all = context.globalState.get<ProjectStateMap>(STORAGE_KEY, {});
  const existing = all[normalize(rootDir)];
  return existing ? { ...defaultUiState(), ...existing } : defaultUiState();
}

export async function saveProjectState(
  context: vscode.ExtensionContext,
  rootDir: string,
  state: UiState
): Promise<void> {
  const all = context.globalState.get<ProjectStateMap>(STORAGE_KEY, {});
  all[normalize(rootDir)] = state;
  await context.globalState.update(STORAGE_KEY, all);
}

function normalize(rootDir: string): string {
  // Keep a stable key regardless of trailing slash differences.
  return rootDir.replace(/[\\/]+$/, '');
}
