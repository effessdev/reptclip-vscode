import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Writes `content` to `outputPath`. An empty/blank `outputPath` is treated
 * as "don't write a file" (equivalent to the CLI's `o ""`). Relative paths
 * are resolved against the project root; absolute paths are used as-is.
 */
export async function writeOutputFile(
  rootDir: string,
  outputPath: string,
  content: string
): Promise<void> {
  const trimmed = outputPath.trim();
  if (!trimmed) {
    return;
  }

  const resolved = path.isAbsolute(trimmed) ? trimmed : path.join(rootDir, trimmed);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, 'utf8');
}
