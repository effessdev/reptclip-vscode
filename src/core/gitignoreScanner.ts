import * as fs from "fs/promises";
import * as path from "path";
import ignore, { Ignore } from "ignore";

interface IgnoreLevel {
  /** Absolute directory the .gitignore file that produced `ig` lives in. */
  dir: string;
  ig: Ignore;
}

const ALWAYS_IGNORED_DIR_NAMES = new Set([".git"]);

/**
 * Recursively walks `rootDir` and returns every file's path relative to
 * `rootDir` (posix-style separators) that is NOT excluded by any
 * .gitignore found along the way.
 *
 * This mirrors git's own layering behaviour without shelling out to git:
 * every directory's .gitignore is scoped to that directory and below, and
 * rules accumulate as you descend. The `ignore` package (npm) is used for
 * the actual pattern matching at each level, since gitignore pattern
 * semantics are easy to get subtly wrong by hand.
 */
export async function collectNonIgnoredFiles(
  rootDir: string,
): Promise<string[]> {
  const results: string[] = [];
  const rootLevel: IgnoreLevel = { dir: rootDir, ig: ignore() };
  await walk(rootDir, rootDir, [rootLevel], results);
  return results.sort();
}

/** Verdict from the embedding guard: may this path be read into context? */
export interface EmbedVerdict {
  ok: boolean;
  /** Human-readable cause, shown in the panel when `ok` is false. */
  reason?: string;
}

/**
 * Builds the single chokepoint that decides whether a relative path may be
 * embedded in generated context. Every read that feeds the Markdown output
 * goes through it, so ignored files can never slip in — no matter which
 * feature asked for them.
 *
 * The rules are exactly the ones the full-tree scan applies: layered,
 * per-directory `.gitignore` evaluation (root rules down to the file's own
 * directory, via the `ignore` package) plus the unconditional `.git`
 * exclusion. Since it consults the same `.gitignore` files (cached per
 * directory across calls), anything `collectNonIgnoredFiles` would have
 * listed passes here and anything it skipped does not.
 *
 * Absolute paths and anything resolving outside `rootDir` are rejected too, so
 * a hand-written or chatbot-generated list can't reach the filesystem beyond
 * the project.
 */
export function createEmbeddingGuard(
  rootDir: string,
): (relPath: string) => Promise<EmbedVerdict> {
  const rootNorm = path.normalize(rootDir);
  const levelsCache = new Map<string, Promise<IgnoreLevel[]>>();

  // Ignore levels for `dirAbs`, inherited from its ancestors and extended by
  // its own .gitignore when present. Memoized per directory, so checking many
  // files in one folder reads that folder's .gitignore once.
  const levelsFor = (dirAbs: string): Promise<IgnoreLevel[]> => {
    const key = path.normalize(dirAbs);
    const cached = levelsCache.get(key);
    if (cached) {
      return cached;
    }

    const pending = (async () => {
      const parent = path.dirname(key);
      const inherited =
        key === rootNorm || parent === key
          ? [{ dir: rootNorm, ig: ignore() }]
          : await levelsFor(parent);
      const content = await readFileIfExists(path.join(key, ".gitignore"));
      return content === null
        ? inherited
        : [...inherited, { dir: key, ig: ignore().add(content) }];
    })();

    levelsCache.set(key, pending);
    return pending;
  };

  return async (relPath: string): Promise<EmbedVerdict> => {
    const segments = relPath.split(/[\\/]+/).filter(Boolean);

    if (segments.length === 0) {
      return { ok: false, reason: "empty path" };
    }
    if (path.isAbsolute(relPath)) {
      return {
        ok: false,
        reason: "absolute path; must be relative to the project root",
      };
    }
    if (segments.some((s) => ALWAYS_IGNORED_DIR_NAMES.has(s))) {
      return { ok: false, reason: "inside .git, which is never embedded" };
    }

    const absPath = path.normalize(path.join(rootNorm, ...segments));
    if (absPath !== rootNorm && !absPath.startsWith(rootNorm + path.sep)) {
      return { ok: false, reason: "resolves outside the project root" };
    }

    const levels = await levelsFor(path.dirname(absPath));
    if (isIgnored(absPath, false, levels)) {
      return { ok: false, reason: "ignored by .gitignore" };
    }

    return { ok: true };
  };
}

async function walk(
  rootDir: string,
  currentDir: string,
  levels: IgnoreLevel[],
  results: string[],
): Promise<void> {
  let levelsForDir = levels;

  const gitignorePath = path.join(currentDir, ".gitignore");
  const gitignoreContent = await readFileIfExists(gitignorePath);
  if (gitignoreContent !== null) {
    const ig = ignore().add(gitignoreContent);
    levelsForDir = [...levels, { dir: currentDir, ig }];
  }

  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    // Directory vanished or is unreadable (permissions, symlink loop, etc).
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && ALWAYS_IGNORED_DIR_NAMES.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);

    if (isIgnored(fullPath, entry.isDirectory(), levelsForDir)) {
      continue;
    }

    if (entry.isSymbolicLink()) {
      // Avoid following symlinks to prevent infinite loops / escaping the root.
      continue;
    }

    if (entry.isDirectory()) {
      await walk(rootDir, fullPath, levelsForDir, results);
    } else if (entry.isFile()) {
      const relFromRoot = toPosixPath(path.relative(rootDir, fullPath));
      results.push(relFromRoot);
    }
  }
}

function isIgnored(
  fullPath: string,
  isDirectory: boolean,
  levels: IgnoreLevel[],
): boolean {
  for (const level of levels) {
    const rel = toPosixPath(path.relative(level.dir, fullPath));
    if (!rel || rel.startsWith("..")) {
      continue;
    }
    // The `ignore` package wants directory patterns tested with matching
    // semantics; passing isDirectory lets patterns like `build/` match.
    if (level.ig.ignores(isDirectory ? `${rel}/` : rel)) {
      return true;
    }
  }
  return false;
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function toPosixPath(p: string): string {
  return p.split(path.sep).join("/");
}
