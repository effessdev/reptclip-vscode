import micromatch from 'micromatch';

/**
 * Given every non-gitignored file (relative, posix-style paths) and a set
 * of include/exclude patterns, returns the files that should be embedded
 * in the generated Markdown. Include patterns are applied first, then
 * exclude patterns narrow that result — matching the original CLI's
 * documented precedence.
 */
export function selectFiles(
  allFiles: string[],
  includePatterns: string[],
  excludePatterns: string[]
): string[] {
  if (includePatterns.length === 0) {
    return [];
  }

  let selected = micromatch(allFiles, includePatterns, { dot: true, nocase: false });

  if (excludePatterns.length > 0) {
    const excluded = new Set(micromatch(allFiles, excludePatterns, { dot: true, nocase: false }));
    selected = selected.filter((f) => !excluded.has(f));
  }

  return selected;
}
