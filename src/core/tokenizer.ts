/**
 * Splits a raw textarea value into individual glob patterns / relative paths.
 *
 * Rules:
 *  - Whitespace (including newlines) separates patterns.
 *  - Single or double quotes let a pattern contain spaces; the quotes
 *    themselves are stripped and are NOT required otherwise (this is the
 *    friction point the extension fixes compared to the original CLI, which
 *    always needed shell quoting).
 *  - No other shell-style escaping is supported by design (kept simple).
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quoteChar: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (quoteChar) {
      if (ch === quoteChar) {
        quoteChar = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quoteChar = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}
