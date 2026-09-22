# ReptClip (VS Code Extension)

A panel-based reimplementation of the [ReptClip](https://github.com/effessdev/reptclip) CLI idea: turn your
project into clean Markdown context for an LLM chat, without leaving the editor and without
needing to quote every glob pattern.

## What's different from the CLI

- **No shell quoting.** Patterns are typed into a textarea and split on whitespace; quotes
  (`'`/`"`) are only needed for a pattern that itself contains a space.
- **No `reptclip-config.toml` / presets.** State (include/exclude patterns and the checkboxes)
  is saved automatically per project, keyed by the project's absolute path, so it survives
  restarts and doesn't leak between projects.
- **Lives in the Panel area**, next to Terminal/Output/Debug Console, instead of being a
  standalone terminal command.

## Using it

1. Open the **ReptClip** tab in the bottom panel (same area as the Terminal).
2. **Files to include** — patterns/paths separated by spaces (e.g. `AGENTS.md src/**/*.py`).
3. **Files to exclude** — same syntax; applied after include patterns.
4. Checkboxes: **Clipboard**, **Project structure**, **Prompt tail**, plus an **Output file**
   text box (leave empty to skip writing a file; accepts relative or absolute paths).
5. Click **Generate**, or press **Enter** while focused in either pattern box (Shift+Enter for
   a literal newline instead).

Only files not excluded by `.gitignore` are ever considered, using layered, per-directory
`.gitignore` parsing (via the `ignore` package) rather than shelling out to git.

## Project layout

```
src/
  extension.ts                 Activation entry point
  panel/
    ReptclipViewProvider.ts    WebviewViewProvider: wiring, messages, run orchestration
    getHtml.ts                 Webview HTML shell (CSP, asset URIs)
  core/
    types.ts                   Shared UiState / message shapes
    tokenizer.ts                Quote-aware whitespace splitting for pattern input
    gitignoreScanner.ts         Recursive, gitignore-aware file listing
    patternMatcher.ts           Include/exclude glob matching (micromatch)
    fileGuards.ts                Binary detection + 1 MB size guard
    markdownBuilder.ts          Assembles the final Markdown
    clipboard.ts                 vscode.env.clipboard wrapper
    outputWriter.ts             Optional output-file writer
    generateContext.ts          Orchestrates the above into one result
    projectStorage.ts           Per-project persistence (globalState, keyed by abs path)
webview-ui/
  main.js, style.css            Plain HTML/CSS/JS client for the panel (no framework)
media/
  icon.svg                      Panel tab icon
```

Each concern (scanning, matching, guards, persistence, rendering) lives in its own module so
any piece — e.g. swapping `micromatch` for another matcher, or persistence to a different
store — can be replaced without touching the rest.

## Setup

```bash
npm install
npm run watch     # bundles src/extension.ts -> dist/extension.js and watches for changes
```

Then press **F5** in VS Code (or Run ▸ Start Debugging) to launch an Extension Development
Host with ReptClip loaded. Open a folder there and use the ReptClip panel.

To produce an installable `.vsix`:

```bash
npm run build
npx vsce package
```

## Assumptions made while building this

A few implementation decisions were made without back-and-forth since they were flagged as
defaults up front — happy to change any of these:

- The "current project" is the workspace folder containing the active editor, falling back to
  the first open workspace folder (no multi-root picker yet).
- Unchecking **Project structure** omits that section entirely rather than leaving an empty
  header.
- First run in a project pre-fills **Files to include** with `AGENTS.md` (matching the CLI's
  old default preset); everything else starts blank/on as shown in the checkboxes.
- Binary detection is a null-byte sniff over the first ~8 KB, and the size guard is the same
  1 MB threshold as the CLI.
- The webview UI is plain HTML/CSS/JS styled with VS Code's theme CSS variables — no React/
  Svelte/etc., to keep the bundle small and avoid extra build tooling.
