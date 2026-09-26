import micromatch from "micromatch";

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
  excludePatterns: string[],
): string[] {
  if (includePatterns.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const selected: string[] = [];

  for (const pattern of includePatterns) {
    const matches = micromatch(allFiles, [pattern], {
      dot: true,
      nocase: false,
    });
    for (const file of matches.sort()) {
      if (!seen.has(file)) {
        seen.add(file);
        selected.push(file);
      }
    }
  }

  if (excludePatterns.length > 0) {
    const excluded = new Set(
      micromatch(allFiles, excludePatterns, { dot: true, nocase: false }),
    );
    return selected.filter((f) => !excluded.has(f));
  }

  return selected;
}

/**
 * Whether a single pattern matches at least one of the given files. Used by
 * the panel to color each include/exclude token (green = hits something,
 * yellow = matches nothing). Applies the same micromatch options as
 * `selectFiles` so the highlighting never disagrees with an actual run.
 */
export function matchesAnyFile(allFiles: string[], pattern: string): boolean {
  return (
    micromatch(allFiles, [pattern], { dot: true, nocase: false }).length > 0
  );
}
