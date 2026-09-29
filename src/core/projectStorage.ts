import * as vscode from "vscode";
import { UiState, defaultUiState } from "./types";

const STORAGE_KEY = "reptclip.projectStates";
const LAST_APPLIED_KEY = "reptclip.lastAppliedDiffs";

type ProjectStateMap = Record<string, UiState>;
type FingerprintMap = Record<string, string>;

/**
 * State is keyed by the project's absolute filesystem path (not VS Code's
 * workspace identity), so it stays correct regardless of how a folder is
 * opened — standalone, as part of a multi-root workspace, etc. — and
 * persists across sessions via globalState.
 */
export function loadProjectState(
  context: vscode.ExtensionContext,
  rootDir: string,
): UiState {
  const all = context.globalState.get<ProjectStateMap>(STORAGE_KEY, {});
  const existing = all[normalize(rootDir)];
  return existing ? { ...defaultUiState(), ...existing } : defaultUiState();
}

export async function saveProjectState(
  context: vscode.ExtensionContext,
  rootDir: string,
  state: UiState,
): Promise<void> {
  const all = context.globalState.get<ProjectStateMap>(STORAGE_KEY, {});
  all[normalize(rootDir)] = state;
  await context.globalState.update(STORAGE_KEY, all);
}

function normalize(rootDir: string): string {
  // Keep a stable key regardless of trailing slash differences.
  return rootDir.replace(/[\\/]+$/, "");
}

/**
 * Fingerprint of the last diff applied to a project, persisted globally
 * (keyed by workspace root) so the "already applied" guard survives a VS Code
 * restart. Only the most recent apply per project is remembered; the panel
 * asks for confirmation before re-applying the remembered diff.
 */
export function loadLastAppliedFingerprint(
  context: vscode.ExtensionContext,
  rootDir: string,
): string | undefined {
  const all = context.globalState.get<FingerprintMap>(LAST_APPLIED_KEY, {});
  return all[normalize(rootDir)];
}

export async function saveLastAppliedFingerprint(
  context: vscode.ExtensionContext,
  rootDir: string,
  fingerprint: string,
): Promise<void> {
  const all = context.globalState.get<FingerprintMap>(LAST_APPLIED_KEY, {});
  all[normalize(rootDir)] = fingerprint;
  await context.globalState.update(LAST_APPLIED_KEY, all);
}
