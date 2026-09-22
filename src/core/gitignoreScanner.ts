import * as fs from 'fs/promises';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';

interface IgnoreLevel {
  /** Absolute directory the .gitignore file that produced `ig` lives in. */
  dir: string;
  ig: Ignore;
}

const ALWAYS_IGNORED_DIR_NAMES = new Set(['.git']);

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
export async function collectNonIgnoredFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  const rootLevel: IgnoreLevel = { dir: rootDir, ig: ignore() };
  await walk(rootDir, rootDir, [rootLevel], results);
  return results.sort();
}

async function walk(
  rootDir: string,
  currentDir: string,
  levels: IgnoreLevel[],
  results: string[]
): Promise<void> {
  let levelsForDir = levels;

  const gitignorePath = path.join(currentDir, '.gitignore');
  const gitignoreContent = await readFileIfExists(gitignorePath);
  if (gitignoreContent !== null) {
    const ig = ignore().add(gitignoreContent);
    levelsForDir = [...levels, { dir: currentDir, ig }];
  }

  let entries: import('fs').Dirent[];
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

function isIgnored(fullPath: string, isDirectory: boolean, levels: IgnoreLevel[]): boolean {
  for (const level of levels) {
    const rel = toPosixPath(path.relative(level.dir, fullPath));
    if (!rel || rel.startsWith('..')) {
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
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function toPosixPath(p: string): string {
  return p.split(path.sep).join('/');
}
