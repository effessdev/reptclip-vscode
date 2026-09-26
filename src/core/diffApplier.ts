import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { FileUndoEntry } from "./types";

/**
 * Applies Search/Replace diff blocks copied from an LLM chat, following the
 * output format emitted by `buildMarkdown` (see markdownBuilder.ts):
 *
 *   path/to/file.ext
 *   <<<<<<< SEARCH
 *   verbatim existing code
 *   =======
 *   replacement code
 *   >>>>>>> REPLACE
 *
 * An empty SEARCH creates a new file; an empty REPLACE deletes the matched
 * code (and the whole file when the result leaves it empty).
 */

interface DiffBlock {
  file: string;
  search: string;
  replace: string;
}

export interface ApplySummary {
  modified: number;
  created: number;
  deleted: number;
  /** Blocks whose SEARCH matched only via the whitespace-lenient fallbacks. */
  fuzzy: number;
}

/**
 * What `applyDiffs` returns: the human-facing summary plus the per-file
 * "before" snapshots needed to restore the workspace later. Undo entries are
 * built even if the caller chooses not to keep them.
 */
export interface ApplyResult {
  summary: ApplySummary;
  undo: FileUndoEntry[];
}

const SEARCH_MARKER = "<<<<<<< SEARCH";
const SEPARATOR = "=======";
const REPLACE_MARKER = ">>>>>>> REPLACE";

/**
 * Line-based state machine. Outside a block, every non-empty line is treated
 * as a candidate file path — the one immediately preceding a `<<<<<<< SEARCH`
 * marker is the target of that block. Consecutive blocks for the same file
 * (multi-file example rule 6) simply reuse the last resolved path. Code
 * fences around the whole dump are skipped so both raw and fenced content
 * parse identically.
 */
export function parseDiffBlocks(text: string): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  const lines = text.split(/\r?\n/);

  let state: "outside" | "search" | "replace" = "outside";
  let currentFile: string | undefined;
  let candidatePath: string | undefined;
  let searchLines: string[] = [];
  let replaceLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (state === "outside") {
      if (trimmed.startsWith(SEARCH_MARKER)) {
        state = "search";
        searchLines = [];
        continue;
      }
      // Skip surrounding ``` fences; anything else non-empty is a path candidate.
      if (trimmed.startsWith("```") || trimmed === "") {
        continue;
      }
      candidatePath = trimmed;
      continue;
    }

    if (state === "search") {
      if (trimmed === SEPARATOR) {
        state = "replace";
        replaceLines = [];
        continue;
      }
      searchLines.push(line);
      continue;
    }

    // state === "replace"
    if (trimmed.startsWith(REPLACE_MARKER)) {
      const file = candidatePath ?? currentFile;
      if (!file) {
        throw new Error(
          "Found a SEARCH/REPLACE block with no file path before it.",
        );
      }
      blocks.push({
        file,
        search: searchLines.join("\n"),
        replace: replaceLines.join("\n"),
      });
      currentFile = file;
      candidatePath = undefined;
      state = "outside";
      continue;
    }
    replaceLines.push(line);
  }

  if (state !== "outside") {
    throw new Error("Truncated diff: a SEARCH/REPLACE block is not closed.");
  }
  return blocks;
}

/**
 * Stable content hash of a diff, derived from its parsed blocks (not the raw
 * clipboard text) so line-ending and surrounding-fence differences don't
 * produce a different fingerprint for the same change. Used to remember the
 * last applied diff and avoid re-applying it. Throws on malformed diffs, which
 * mirrors `applyDiffs` so callers surface the same error.
 */
export function fingerprintDiff(text: string): string {
  const blocks = parseDiffBlocks(text);
  if (blocks.length === 0) {
    throw new Error("Clipboard does not contain any SEARCH/REPLACE blocks.");
  }
  const canonical = blocks
    .map((b) => `${b.file}\u0000${b.search}\u0000${b.replace}`)
    .join("\u0001");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/** Resolves a diff path against the workspace root, rejecting escapes. */
function resolveFile(rootDir: string, relative: string): string {
  const cleaned = relative
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
  const root = path.resolve(rootDir);
  const abs = path.resolve(root, cleaned);
  const prefix = root.toLowerCase() + path.sep;
  if (
    abs.toLowerCase() !== root.toLowerCase() &&
    !abs.toLowerCase().startsWith(prefix)
  ) {
    throw new Error(`Diff path escapes the workspace: ${relative}`);
  }
  return abs;
}

async function readFileIfExists(absPath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(absPath, "utf8");
  } catch {
    return undefined;
  }
}

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Builds progressively more forgiving regex patterns from the SEARCH lines,
 * mirroring the liberal matching ladders used by agent edit tools:
 *   1. ignore trailing whitespace on each line
 *   2. ...plus flexible leading indentation
 *   3. ...plus any whitespace run inside a line counts as equivalent
 *      (token-level matching, so tab-vs-space and re-indented code pass)
 */
function lenientPatterns(lines: string[]): string[] {
  const trailing = "[ \\t]*";
  const esc = escapeRegExp;
  const levels = [
    (l: string) => esc(l) + trailing,
    (l: string) => `[ \\t]*${esc(l.replace(/^[ \t]+/, ""))}${trailing}`,
    (l: string) => {
      const tokens = l.trim().split(/\s+/).filter(Boolean).map(esc);
      return tokens.length
        ? `[ \\t]*${tokens.join("[ \\t]+")}${trailing}`
        : "[ \\t]*";
    },
  ];
  return levels.map((perLine) => lines.map(perLine).join("\\r?\\n"));
}

/**
 * Locates `search` in `content`, refusing ambiguous matches. Tolerant of:
 *   - Trailing newlines (a block need not end exactly where the file does).
 *   - Line endings: clipboard text is LF after parsing, while files checked
 *     out on Windows are often CRLF. The REPLACE text is converted to
 *     whichever style matched, keeping the file's convention intact.
 *   - Whitespace drift, via the lenient ladder above (reported as "fuzzy"
 *     so callers can surface it for review).
 */
function findMatch(
  content: string,
  search: string,
  replace: string,
  file: string,
): { index: number; text: string; replace: string; fuzzy: boolean } {
  const normalizeReplace = (matched: string, value: string): string => {
    if (matched.includes("\r\n") && !value.includes("\r\n")) {
      return value.replace(/\n/g, "\r\n");
    }
    if (!matched.includes("\r\n") && value.includes("\r\n")) {
      return value.replace(/\r\n/g, "\n");
    }
    return value;
  };

  // Pass 0: byte-for-byte exact, in every line-ending combination.
  const lf = search.replace(/\r\n/g, "\n");
  const bases = [
    search, // as parsed (also covers search copied with CRLF)
    lf, // normalized to LF for CRLF-vs-LF comparison
    lf.replace(/\n/g, "\r\n"), // converted to CRLF for CRLF files
  ];

  let ambiguous = false;
  for (const base of bases) {
    for (const variant of [base, base.replace(/\r?\n+$/, "")]) {
      if (variant === "") {
        continue;
      }
      const count = content.split(variant).length - 1;
      if (count === 1) {
        return {
          index: content.indexOf(variant),
          text: variant,
          replace: normalizeReplace(variant, replace),
          fuzzy: false,
        };
      }
      if (count > 1) {
        ambiguous = true;
      }
    }
  }

  // Passes 1-3: whitespace-lenient fallbacks, strictest first.
  const body = search.replace(/\r?\n+$/, "");
  if (body !== "") {
    for (const pattern of lenientPatterns(body.split(/\r?\n/))) {
      const matches = [...content.matchAll(new RegExp(pattern, "g"))];
      if (matches.length === 1) {
        const match = matches[0];
        return {
          index: match.index,
          text: match[0],
          replace: normalizeReplace(match[0], replace),
          fuzzy: true,
        };
      }
      if (matches.length > 1) {
        ambiguous = true;
      }
    }
  }

  if (ambiguous) {
    throw new Error(
      `SEARCH block for ${file} matches multiple locations — add more context.`,
    );
  }
  throw new Error(`No match found for the SEARCH block in ${file}.`);
}

interface FilePlan {
  absPath: string;
  /** Path exactly as it appeared in the diff; used as fallback for messages. */
  displayPath: string;
  existed: boolean;
  content: string;
  deleted: boolean;
}

export async function applyDiffs(
  rootDir: string,
  text: string,
): Promise<ApplyResult> {
  const blocks = parseDiffBlocks(text);
  if (blocks.length === 0) {
    throw new Error("Clipboard does not contain any SEARCH/REPLACE blocks.");
  }

  // Simulate every block, in order, per file so all validation happens
  // before anything touches disk.
  const plans = new Map<string, FilePlan>();
  let fuzzy = 0;
  for (const block of blocks) {
    const absPath = resolveFile(rootDir, block.file);
    let plan = plans.get(absPath);
    if (!plan) {
      const original = await readFileIfExists(absPath);
      plan = {
        absPath,
        displayPath: block.file,
        existed: original !== undefined,
        content: original ?? "",
        deleted: false,
      };
      plans.set(absPath, plan);
    }
    if (plan.deleted) {
      throw new Error(`Diff edits ${block.file} after it was deleted.`);
    }

    if (block.search === "") {
      // Empty SEARCH: create (or keep appending to a file being created).
      if (plan.existed && plan.content.trim() !== "") {
        throw new Error(
          `${block.file} already exists — an empty SEARCH block is only for new files.`,
        );
      }
      plan.content += block.replace;
      continue;
    }

    const {
      index,
      text,
      replace,
      fuzzy: lenient,
    } = findMatch(plan.content, block.search, block.replace, block.file);
    if (lenient) {
      fuzzy++;
    }
    plan.content =
      plan.content.slice(0, index) +
      replace +
      plan.content.slice(index + text.length);

    // Empty REPLACE that wipes the whole file deletes it (format rule 4).
    if (block.replace === "" && plan.existed && plan.content.trim() === "") {
      plan.deleted = true;
    }
  }

  // Snapshot the exact bytes on disk before we mutate anything. Same source
  // of truth the plans started from (a fresh `fs.readFile`), so the recorded
  // "before" matches what apply overwrites, tab-for-tab and byte-for-byte.
  const originals = new Map<string, string | null>();
  for (const plan of plans.values()) {
    originals.set(
      plan.absPath,
      plan.existed ? await readUtf8OrNull(plan.absPath) : null,
    );
  }

  const edit = new vscode.WorkspaceEdit();
  let modified = 0;
  let created = 0;
  let deleted = 0;
  // Files whose edits land in an in-memory document buffer; saved below so the
  // user doesn't have to press Save on each one. Deletions need no save.
  const touched: vscode.Uri[] = [];
  for (const plan of plans.values()) {
    const uri = vscode.Uri.file(plan.absPath);
    if (plan.deleted) {
      edit.deleteFile(uri);
      deleted++;
    } else if (!plan.existed) {
      edit.createFile(uri);
      edit.insert(uri, new vscode.Position(0, 0), plan.content);
      created++;
      touched.push(uri);
    } else {
      const doc = await vscode.workspace.openTextDocument(uri);
      const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
      edit.replace(doc.uri, fullRange, plan.content);
      modified++;
      touched.push(uri);
    }
  }

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error("VS Code refused to apply the workspace edit.");
  }

  // `applyEdit` only mutates the documents and leaves them dirty, which is why
  // files used to appear unsaved. Save each one to persist the change. This
  // keeps the editor undo stack intact (unlike writing straight to disk), so a
  // fuzzy or unwanted match can still be reverted with Ctrl+Z.
  for (const uri of touched) {
    const doc = await vscode.workspace.openTextDocument(uri);
    await doc.save();
  }

  const undo: FileUndoEntry[] = [];
  for (const plan of plans.values()) {
    undo.push({
      absPath: plan.absPath,
      relPath: toRelPath(rootDir, plan.absPath, plan.displayPath),
      existedBefore: plan.existed,
      deletedByApply: plan.deleted,
      before: originals.get(plan.absPath) ?? null,
    });
  }

  return {
    summary: { modified, created, deleted, fuzzy },
    undo,
  };
}

/**
 * Reverses a prior `applyDiffs` by writing each file back to the exact bytes
 * captured in `undo` just before that apply ran. This is a *state* restore,
 * not an operation-inverse: any edits made after apply — manual, formatter,
 * or by another tool — will be silently overwritten with the pre-apply bytes.
 *
 * The caller is responsible for user confirmation before invoking this.
 */
export interface RestoreSummary {
  /** Files that were modified by apply; their `before` was written back. */
  restored: number;
  /** Files apply deleted; recreated verbatim from `before`. */
  recreated: number;
  /** Files apply created; deleted now. */
  removed: number;
}

export async function restoreSnapshot(
  undo: FileUndoEntry[],
): Promise<RestoreSummary> {
  if (undo.length === 0) {
    throw new Error("Nothing to restore — the snapshot is empty.");
  }

  const edit = new vscode.WorkspaceEdit();
  const touched: vscode.Uri[] = [];
  let restored = 0;
  let recreated = 0;
  let removed = 0;

  for (const entry of undo) {
    const uri = vscode.Uri.file(entry.absPath);

    if (!entry.existedBefore) {
      // Apply created this file → remove it. If the user already deleted it,
      // VS Code's edit engine tolerates the no-op.
      edit.deleteFile(uri);
      removed++;
      continue;
    }

    if (entry.deletedByApply) {
      // Apply deleted it → recreate verbatim from `before`.
      edit.createFile(uri, { overwrite: true });
      if (entry.before) {
        edit.insert(uri, new vscode.Position(0, 0), entry.before);
      }
      recreated++;
      touched.push(uri);
      continue;
    }

    // Apply modified it → replace the whole buffer with `before`.
    const doc = await vscode.workspace.openTextDocument(uri);
    const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
    edit.replace(doc.uri, fullRange, entry.before ?? "");
    restored++;
    touched.push(uri);
  }

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error("VS Code refused to apply the restore edit.");
  }

  for (const uri of touched) {
    const doc = await vscode.workspace.openTextDocument(uri);
    await doc.save();
  }

  return { restored, recreated, removed };
}

async function readUtf8OrNull(absPath: string): Promise<string | null> {
  try {
    return await fs.readFile(absPath, "utf8");
  } catch {
    return null;
  }
}

function toRelPath(rootDir: string, absPath: string, fallback: string): string {
  const rel = path.relative(rootDir, absPath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    return fallback;
  }
  return rel.replace(/\\/g, "/");
}
