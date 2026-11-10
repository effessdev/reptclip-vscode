import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("panel keeps include/exclude inputs in a responsive split layout", () => {
  const repoRoot = resolve(__dirname, "..", "..");
  const html = readFileSync(
    resolve(repoRoot, "src", "panel", "getHtml.ts"),
    "utf8",
  );
  const css = readFileSync(
    resolve(repoRoot, "webview-ui", "style.css"),
    "utf8",
  );

  assert.match(html, /pattern-pair/);
  assert.match(html, /pattern-divider/);
  assert.match(css, /pattern-pair/);
  assert.match(css, /pattern-divider/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)/i);
});
