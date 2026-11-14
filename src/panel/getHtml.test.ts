import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./getHtml.ts", import.meta.url), "utf8");

test("output file field uses the same stacked-label layout as the other form fields", () => {
  assert.match(source, /<label\s+for="output">\s*Output file\s*<\/label>/s);
  assert.match(source, /<input\s+type="text"\s+id="output"/);
  assert.doesNotMatch(source, /<label[^>]*class="output-file"/);
});
