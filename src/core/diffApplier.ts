import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";

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

/**
 * Locates `search` in `content`, tolerating trailing-newline drift between
 * what the model emitted and the file on disk. Refuses ambiguous matches.
 */
function findMatch(
  content: string,
  search: string,
  file: string,
): { index: number; text: string } {
  const variants = [
    search,
    search.replace(/\n+$/, ""),
    search.endsWith("\n") ? search : search + "\n",
  ];
  let lastCount = 0;
  for (const variant of variants) {
    if (variant === "") {
      continue;
    }
    const count = content.split(variant).length - 1;
    if (count === 1) {
      return { index: content.indexOf(variant), text: variant };
    }
    lastCount = count;
  }
  if (lastCount > 1) {
    throw new Error(
      `SEARCH block for ${file} matches multiple locations — add more context.`,
    );
  }
  throw new Error(`No exact match for the SEARCH block in ${file}.`);
}

interface FilePlan {
  absPath: string;
  existed: boolean;
  content: string;
  deleted: boolean;
}

export async function applyDiffs(
  rootDir: string,
  text: string,
): Promise<ApplySummary> {
  const blocks = parseDiffBlocks(text);
  if (blocks.length === 0) {
    throw new Error("Clipboard does not contain any SEARCH/REPLACE blocks.");
  }

  // Simulate every block, in order, per file so all validation happens
  // before anything touches disk.
  const plans = new Map<string, FilePlan>();
  for (const block of blocks) {
    const absPath = resolveFile(rootDir, block.file);
    let plan = plans.get(absPath);
    if (!plan) {
      const original = await readFileIfExists(absPath);
      plan = {
        absPath,
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

    const { index, text } = findMatch(plan.content, block.search, block.file);
    plan.content =
      plan.content.slice(0, index) +
      block.replace +
      plan.content.slice(index + text.length);

    // Empty REPLACE that wipes the whole file deletes it (format rule 4).
    if (block.replace === "" && plan.existed && plan.content.trim() === "") {
      plan.deleted = true;
    }
  }

  const edit = new vscode.WorkspaceEdit();
  let modified = 0;
  let created = 0;
  let deleted = 0;
  for (const plan of plans.values()) {
    const uri = vscode.Uri.file(plan.absPath);
    if (plan.deleted) {
      edit.deleteFile(uri);
      deleted++;
    } else if (!plan.existed) {
      edit.createFile(uri);
      edit.insert(uri, new vscode.Position(0, 0), plan.content);
      created++;
    } else {
      const doc = await vscode.workspace.openTextDocument(uri);
      const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
      edit.replace(doc.uri, fullRange, plan.content);
      modified++;
    }
  }

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error("VS Code refused to apply the workspace edit.");
  }
  return { modified, created, deleted };
}
