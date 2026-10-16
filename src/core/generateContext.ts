import * as path from "path";
import * as fs from "fs/promises";
import {
  collectNonIgnoredFiles,
  createEmbeddingGuard,
} from "./gitignoreScanner";
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
 *
 * Naming a file here grants no access: the same `.gitignore` rules that shape
 * Generate's candidate pool apply, and the whole list is validated up front so
 * a single unacceptable path aborts the run instead of producing partial
 * context.
 */
export async function moreFiles(
  rootDir: string,
  state: UiState,
  pathList: string,
): Promise<GenerateResult> {
  const includedFiles = parsePathList(pathList);

  // Validate before touching the clipboard/output: if any listed path can't be
  // embedded (missing, a directory, ignored by `.gitignore`, outside the root),
  // abort and report each one with its reason.
  const rejected = await findRejectedPaths(rootDir, includedFiles);
  if (rejected.length > 0) {
    const detail = rejected.map((r) => `${r.path} (${r.reason})`).join(", ");
    throw new Error(`Cannot embed: ${detail}`);
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

// Checks each path against the embedding guard and the filesystem, returning
// the ones that must not be embedded along with why. Directories are rejected
// as clearly as missing files, since only file contents can be embedded.
async function findRejectedPaths(
  rootDir: string,
  relPaths: string[],
): Promise<{ path: string; reason: string }[]> {
  const guard = createEmbeddingGuard(rootDir);
  const rejected: { path: string; reason: string }[] = [];

  for (const rel of relPaths) {
    const verdict = await guard(rel);
    if (!verdict.ok) {
      rejected.push({
        path: rel,
        reason: verdict.reason ?? "cannot be embedded",
      });
      continue;
    }
    try {
      const stat = await fs.stat(path.join(rootDir, rel));
      if (!stat.isFile()) {
        rejected.push({ path: rel, reason: "not a file" });
      }
    } catch {
      rejected.push({ path: rel, reason: "not found" });
    }
  }

  return rejected;
}

// Reads every selected file and assembles the final Markdown. Shared by
// `generateContext` and `moreFiles`, and the only place that reads files for
// embedding — each path clears the embedding guard first, so anything
// `.gitignore` hides can never be embedded regardless of which feature listed
// it. A path that can't be read (e.g. deleted between validation and reading)
// degrades to a placeholder instead of failing the whole run.
async function buildContext(
  rootDir: string,
  state: UiState,
  includedFiles: string[],
  allFiles: string[],
): Promise<GenerateResult> {
  const guard = createEmbeddingGuard(rootDir);
  const fileContents: Record<string, string> = {};
  for (const relPath of includedFiles) {
    const verdict = await guard(relPath);
    if (!verdict.ok) {
      fileContents[relPath] = `[Skipped: ${verdict.reason}]`;
      continue;
    }

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
