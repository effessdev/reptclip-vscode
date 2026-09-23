import * as path from "path";
import { collectNonIgnoredFiles } from "./gitignoreScanner";

const MAX_SUGGESTIONS = 50;

/**
 * Builds the full set of completion candidates for the include/exclude boxes:
 * every non-gitignored file path plus every parent directory (with a trailing
 * slash so the webview can offer folder navigation). All paths are relative to
 * `rootDir` and posix-style, matching what `generateContext` ultimately matches
 * against.
 */
export async function collectCandidates(rootDir: string): Promise<string[]> {
  const files = await collectNonIgnoredFiles(rootDir);
  const set = new Set<string>(files);

  for (const file of files) {
    let dir = path.posix.dirname(file);
    while (dir && dir !== "." && dir !== "/") {
      set.add(`${dir}/`);
      dir = path.posix.dirname(dir);
    }
  }

  return [...set].sort();
}

/**
 * Case-insensitive prefix filter over pre-sorted candidates. Returns at most
 * `limit` matches. An empty prefix yields no results on purpose — suggestions
 * only appear once the user has started typing a token.
 */
export function filterCandidates(
  candidates: string[],
  prefix: string,
  limit: number = MAX_SUGGESTIONS,
): string[] {
  if (!prefix) {
    return [];
  }

  const lower = prefix.toLowerCase();
  const out: string[] = [];
  for (const candidate of candidates) {
    if (candidate.toLowerCase().startsWith(lower)) {
      out.push(candidate);
      if (out.length >= limit) {
        break;
      }
    }
  }
  return out;
}
