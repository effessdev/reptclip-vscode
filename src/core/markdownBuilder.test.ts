import test from "node:test";
import assert from "node:assert/strict";

import { buildMarkdown } from "./markdownBuilder";

test("buildMarkdown omits file sections when includeFiles is false", () => {
  const markdown = buildMarkdown({
    allFiles: ["src/a.ts", "src/b.ts"],
    includedFiles: ["src/a.ts"],
    fileContents: { "src/a.ts": "const value = 1;" },
    includeStructure: true,
    includeDiffFormat: false,
    includePromptTail: false,
    includeFiles: false,
  });

  assert.ok(markdown.includes("# Project structure"));
  assert.ok(!markdown.includes("# src/a.ts"));
});
