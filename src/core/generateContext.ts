import * as path from "path";
import * as fs from "fs/promises";
import { collectNonIgnoredFiles } from "./gitignoreScanner";
import { selectFiles } from "./patternMatcher";
import { tokenize } from "./tokenizer";
import { readFileSafe } from "./fileGuards";
import { buildMarkdown } from "./markdownBuilder";
import { GenerateResult, UiState } from "./types";

export async function generateContext(
  rootDir: string,
  state: UiState,
): Promise<GenerateResult> {
  const allFiles = await collectNonIgnoredFiles(rootDir);

  const includePatterns = tokenize(state.include);
  const excludePatterns = tokenize(state.exclude);
  const includedFiles = selectFiles(allFiles, includePatterns, excludePatterns);

  return buildContext(rootDir, state, includedFiles, allFiles);
}

/**
 * Same output as `generateContext`, but the list of files to embed comes from
 * the clipboard (one relative path per line) instead of the include/exclude
 * patterns. The structure / diff-format / prompt-tail options are honoured
 * exactly as they are for Generate, so the two features share all formatting
 * logic via `buildContext`.
 */
export async function moreFiles(
  rootDir: string,
  state: UiState,
  pathList: string,
): Promise<GenerateResult> {
  const includedFiles = parsePathList(pathList);

  // Validate before touching the clipboard/output: if any listed path can't
  // be found, abort and report exactly which ones failed.
  const missing = await findMissingFiles(rootDir, includedFiles);
  if (missing.length > 0) {
    throw new Error(`File(s) not found: ${missing.join(", ")}`);
  }

  const allFiles = state.projectStructure
    ? await collectNonIgnoredFiles(rootDir)
    : [];

  return buildContext(rootDir, state, includedFiles, allFiles);
}

// Splits clipboard text into relative paths, one per line, the way Python's
// str.split() drops empty pieces: surrounding whitespace trimmed, blank lines
// (including runs of consecutive newlines) skipped, duplicates removed while
// preserving order.
function parsePathList(pathList: string): string[] {
  const seen = new Set<string>();
  const files: string[] = [];
  for (const line of pathList.split(/\r?\n/)) {
    const rel = line.trim();
    if (!rel || seen.has(rel)) {
      continue;
    }
    seen.add(rel);
    files.push(rel);
  }
  return files;
}

// Returns the relative paths that don't resolve to an existing file under
// `rootDir` (missing or pointing at a directory).
async function findMissingFiles(
  rootDir: string,
  relPaths: string[],
): Promise<string[]> {
  const missing: string[] = [];
  for (const rel of relPaths) {
    try {
      const stat = await fs.stat(path.join(rootDir, rel));
      if (!stat.isFile()) {
        missing.push(rel);
      }
    } catch {
      missing.push(rel);
    }
  }
  return missing;
}

// Reads every selected file and assembles the final Markdown. Shared by
// `generateContext` and `moreFiles`. A path that can't be read (e.g. one typed
// into the clipboard that no longer exists) degrades to a placeholder instead
// of failing the whole run.
async function buildContext(
  rootDir: string,
  state: UiState,
  includedFiles: string[],
  allFiles: string[],
): Promise<GenerateResult> {
  const fileContents: Record<string, string> = {};
  for (const relPath of includedFiles) {
    const absPath = path.join(rootDir, relPath);
    try {
      const result = await readFileSafe(absPath);
      fileContents[relPath] = result.skipped
        ? `[${result.reason}]`
        : (result.content ?? "");
    } catch {
      fileContents[relPath] = "[File not found]";
    }
  }

  const markdown = buildMarkdown({
    allFiles,
    includedFiles,
    fileContents,
    includeStructure: state.projectStructure,
    includeDiffFormat: state.diffFormat,
    includePromptTail: state.promptTail,
  });

  return { markdown, allFiles, includedFiles };
}
