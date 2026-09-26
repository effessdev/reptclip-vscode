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

/** Messages sent from the extension host to the webview. */
export type HostToWebviewMessage =
  | { type: "init"; state: UiState; hasWorkspace: boolean }
  | { type: "runResult"; ok: true; fileCount: number }
  | { type: "runResult"; ok: false; error: string }
  | {
      type: "applyResult";
      ok: true;
      modified: number;
      created: number;
      deleted: number;
      fuzzy: number;
    }
  | { type: "applyResult"; ok: false; error: string }
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
  | { type: "suggest"; requestId: number; prefix: string }
  | { type: "highlight"; requestId: number; include: string; exclude: string };
