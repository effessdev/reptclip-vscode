import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

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
 * The before/after content of a single file touched by an apply, keyed by
 * its workspace-relative path. `undefined` stands for "file does not exist"
 * on that side, so a snapshot can represent a creation or a deletion as well
 * as a plain content change.
 */
export interface FileSnapshot {
  relPath: string;
  before: string | undefined;
  after: string | undefined;
}

/** One applied diff's worth of undo/redo information. */
export interface Checkpoint {
  files: FileSnapshot[];
}

export interface ApplyResult extends ApplySummary {
  /** Lets the caller push this apply onto an undo stack. */
  checkpoint: Checkpoint;
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
async function resolveFile(
  rootDir: string,
  relative: string,
): Promise<string> {
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

  // Lexical containment is not enough: a directory junction or symlink inside
  // the workspace makes `root/link/...` look local while the write lands
  // somewhere else. Resolve the real path of the deepest existing ancestor and
  // compare it with the real workspace root, so a link can never carry a diff
  // outside the project.
  const rootReal = await fs.realpath(root).catch(() => undefined);
  if (rootReal === undefined) {
    throw new Error(
      `Diff path escapes the workspace: ${relative} (workspace root is not readable)`,
    );
  }

  let probe = abs;
  const trailing: string[] = [];
  for (;;) {
    let probeReal: string | undefined;
    try {
      probeReal = await fs.realpath(probe);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error(
          `Diff path cannot be resolved: ${relative} (${(err as Error).message})`,
        );
      }
    }
    if (probeReal !== undefined) {
      const resolved = trailing.length
        ? path.resolve(probeReal, ...trailing)
        : probeReal;
      if (!isInside(rootReal, resolved)) {
        throw new Error(
          `Diff path escapes the workspace: ${relative} (resolves to ${resolved})`,
        );
      }
      // Keep the original path so the edit targets the path the user sees.
      return abs;
    }
    const parent = path.dirname(probe);
    if (parent === probe) {
      throw new Error(`Diff path escapes the workspace: ${relative}`);
    }
    trailing.unshift(path.basename(probe));
    probe = parent;
  }
}

/** Whether `candidate` is `root` itself or lives inside it, using OS case rules. */
function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
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
      `SEARCH block for ${file} matches multiple locations. Please provide more context.`,
    );
  }
  throw new Error(`No match found for the SEARCH block in ${file}.`);
}

interface FilePlan {
  absPath: string;
  /** Workspace-relative path (forward slashes), used to key a checkpoint. */
  relPath: string;
  existed: boolean;
  /** The file's content before this operation, if it existed. */
  original: string | undefined;
  content: string;
  deleted: boolean;
}

/**
 * Turns a set of file plans into disk changes via a single workspace edit:
 * creates, modifies, or deletes each file, saves the dirty buffers it
 * touched, and reveals them in the editor. Shared by `applyDiffs` (acting on
 * freshly matched SEARCH/REPLACE results) and `applySnapshot` (acting on a
 * stored checkpoint for undo/redo), so both paths commit changes identically.
 */
async function commitPlans(
  plans: Iterable<FilePlan>,
): Promise<{ modified: number; created: number; deleted: number }> {
  const edit = new vscode.WorkspaceEdit();
  let modified = 0;
  let created = 0;
  let deleted = 0;
  // Files whose edits land in an in-memory document buffer; saved below so the
  // user doesn't have to press Save on each one. Deletions need no save.
  const touched: vscode.Uri[] = [];
  for (const plan of plans) {
    const uri = vscode.Uri.file(plan.absPath);
    if (plan.deleted) {
      edit.deleteFile(uri, { ignoreIfNotExists: true });
      deleted++;
    } else if (!plan.existed) {
      edit.createFile(uri, { overwrite: true });
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

  // Open each affected file as a pinned tab without stealing focus, so the
  // user sees all changes; then reveal the first one (in diff order) so
  // focus lands somewhere predictable instead of flickering through each.
  // If a file is already open, VS Code reuses its existing tab.
  for (const uri of touched) {
    await vscode.window.showTextDocument(uri, {
      preview: false,
      preserveFocus: true,
    });
  }
  if (touched.length > 0) {
    await vscode.window.showTextDocument(touched[0], { preview: false });
  }

  return { modified, created, deleted };
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
    const absPath = await resolveFile(rootDir, block.file);
    let plan = plans.get(absPath);
    if (!plan) {
      const original = await readFileIfExists(absPath);
      plan = {
        absPath,
        relPath: path
          .relative(path.resolve(rootDir), absPath)
          .split(path.sep)
          .join("/"),
        existed: original !== undefined,
        original,
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
          `${block.file} already exists. An empty SEARCH block is only for new files.`,
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

  const snapshot: FileSnapshot[] = Array.from(plans.values()).map((plan) => ({
    relPath: plan.relPath,
    before: plan.existed ? plan.original : undefined,
    after: plan.deleted ? undefined : plan.content,
  }));

  const { modified, created, deleted } = await commitPlans(plans.values());

  return {
    modified,
    created,
    deleted,
    fuzzy,
    checkpoint: { files: snapshot },
  };
}

/**
 * Restores a checkpoint's file contents in the given direction: "undo" sets
 * every file back to its pre-apply content (deleting ones that didn't exist
 * yet), "redo" re-applies the post-apply content (deleting ones the original
 * apply had removed). Uses the current on-disk state, not the checkpoint's
 * own `existed` bookkeeping, to decide create-vs-modify, so it still behaves
 * sensibly if a file was touched by hand since the checkpoint was recorded.
 */
export async function applySnapshot(
  rootDir: string,
  files: FileSnapshot[],
  direction: "undo" | "redo",
): Promise<ApplySummary> {
  const plans: FilePlan[] = [];
  for (const file of files) {
    const target = direction === "undo" ? file.before : file.after;
    const absPath = await resolveFile(rootDir, file.relPath);
    const currentContent = await readFileIfExists(absPath);
    const currentExists = currentContent !== undefined;

    if (target === undefined) {
      if (currentExists) {
        plans.push({
          absPath,
          relPath: file.relPath,
          existed: true,
          original: currentContent,
          content: "",
          deleted: true,
        });
      }
      continue;
    }

    plans.push({
      absPath,
      relPath: file.relPath,
      existed: currentExists,
      original: currentContent,
      content: target,
      deleted: false,
    });
  }

  const { modified, created, deleted } = await commitPlans(plans);
  return { modified, created, deleted, fuzzy: 0 };
}
