/**
 * The full set of controls exposed in the panel, and the shape that gets
 * persisted per-project and sent back and forth to the webview.
 */
export interface UiState {
  include: string;
  exclude: string;
  clipboard: boolean;
  projectStructure: boolean;
  diffFormat: boolean;
  promptTail: boolean;
  outputFile: string;
}

export function defaultUiState(): UiState {
  return {
    include: "",
    exclude: "",
    clipboard: true,
    projectStructure: true,
    diffFormat: true,
    promptTail: true,
    outputFile: "",
  };
}

export interface GenerateResult {
  markdown: string;
  allFiles: string[];
  includedFiles: string[];
}

/**
 * Per-file snapshot captured just before `applyDiffs` mutates anything. Kept
 * in memory for the lifetime of the extension host; the "Restore" button
 * writes these bytes back verbatim.
 *
 *   existedBefore=false            → apply created the file; restore deletes it.
 *   existedBefore=true, deletedByApply=true
 *                                  → apply deleted the file; restore recreates
 *                                    it from `before`.
 *   otherwise                      → apply modified the file; restore overwrites
 *                                    the whole buffer with `before`.
 */
export interface FileUndoEntry {
  absPath: string;
  /** Path relative to the workspace root; used for user-facing messages. */
  relPath: string;
  existedBefore: boolean;
  deletedByApply: boolean;
  /** UTF-8 bytes as they were on disk just before apply. Null if !existedBefore. */
  before: string | null;
}

export interface UndoSnapshot {
  fingerprint: string;
  files: FileUndoEntry[];
}

/** Messages sent from the extension host to the webview. */
export type HostToWebviewMessage =
  | {
      type: "init";
      state: UiState;
      hasWorkspace: boolean;
      /** True when an in-memory restore snapshot exists for this project. */
      canRevert: boolean;
    }
  | { type: "runResult"; ok: true; fileCount: number }
  | { type: "runResult"; ok: false; error: string }
  | {
      type: "applyResult";
      ok: true;
      modified: number;
      created: number;
      deleted: number;
      fuzzy: number;
      alreadyApplied?: boolean;
      canRevert?: boolean;
    }
  | { type: "applyResult"; ok: false; error: string }
  | {
      type: "revertResult";
      ok: true;
      restored: number;
      recreated: number;
      removed: number;
      cancelled?: boolean;
    }
  | { type: "revertResult"; ok: false; error: string }
  | { type: "suggestResult"; requestId: number; items: string[] }
  | {
      type: "highlightResult";
      requestId: number;
      include: boolean[];
      exclude: boolean[];
    };

/** Messages sent from the webview to the extension host. */
export type WebviewToHostMessage =
  | { type: "stateChanged"; state: UiState }
  | { type: "run"; state: UiState }
  | { type: "applyDiffs" }
  | { type: "revertDiff" }
  | { type: "suggest"; requestId: number; prefix: string }
  | { type: "highlight"; requestId: number; include: string; exclude: string };
