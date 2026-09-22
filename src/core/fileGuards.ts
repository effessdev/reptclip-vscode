import * as fs from 'fs/promises';

const MAX_BYTES = 1024 * 1024; // 1 MB, same threshold as the CLI.
const BINARY_SNIFF_BYTES = 8000;

export interface SafeReadResult {
  skipped: boolean;
  reason?: string;
  content?: string;
}

/**
 * Reads a file's contents, but instead of throwing/erroring on files that
 * would bloat or break the output, returns a descriptive placeholder for
 * binaries and oversized files — matching the CLI's "automatic guards".
 */
export async function readFileSafe(absPath: string): Promise<SafeReadResult> {
  const stat = await fs.stat(absPath);

  if (stat.size > MAX_BYTES) {
    return {
      skipped: true,
      reason: `File skipped: exceeds 1 MB (${formatBytes(stat.size)}).`,
    };
  }

  const buffer = await fs.readFile(absPath);

  if (looksBinary(buffer)) {
    return { skipped: true, reason: 'File skipped: appears to be binary.' };
  }

  return { skipped: false, content: buffer.toString('utf8') };
}

function looksBinary(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
