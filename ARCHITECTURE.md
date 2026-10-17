# ARCHITECTURE

How ReptClip is put together. This document is for anything editing the code —
human developers and AI agents alike. It maps every module to a single job,
shows how they wire together, and calls out the invariants that keep the design
safe and readable, so you can make a correct edit without loading the whole
codebase first. For what the extension *does* from a user's point of view, see
[README.md](README.md).

## Layers

The extension is a VS Code **webview view** (a panel registered in the bottom
panel). It splits into three layers, separated by two narrow interfaces.

- **Webview UI** (`webview-ui/`) runs in a browser sandbox with no VS Code APIs.
  It has no filesystem or clipboard access; anything touching the machine
  happens on the host side.
- **Host orchestrator** (`src/panel/ReptclipViewProvider.ts`) runs in the
  extension host. It builds the webview, loads persisted state, routes every
  incoming message to the right core module, and owns the caches plus the
  filesystem watcher that drive live highlighting.
- **Core logic** (`src/core/`) holds the actual work: parsing, glob matching,
  Markdown assembly, diff matching, and thin wrappers over VS Code services.

The webview and host meet solely at the message protocol (defined in
`core/types.ts`), and the host meets core modules solely at their exported
functions — values passed as arguments, never through shared state. No layer
reaches past the one beside it.

The key rule (from [AGENTS.md](AGENTS.md)): **only the orchestrator knows about
and connects the core modules.** Core modules never reach into each other's
internals or into app state; anything with no UI dependency (parsing, glob
matching, Markdown assembly, diff matching) is kept free of `vscode` imports so
it stays testable on its own.

## Module map

Each entry names the file, its single job, and whether it imports `vscode`.

### Entry & panel

- **`src/extension.ts`** — `activate`/`deactivate`. Registers the view provider
  with `retainContextWhenHidden` so switching panel tabs doesn't wipe unsaved
  edits. Wires nothing else and holds no timers or watchers. *(no vscode
  beyond registration)*
- **`src/panel/ReptclipViewProvider.ts`** — The orchestrator. See Layers above;
  it is the only module that connects the core pieces. *(uses vscode)*
- **`src/panel/getHtml.ts`** — Produces the webview's static HTML: a
  Content-Security-Policy with a per-load nonce, links to `webview-ui` assets,
  and the DOM the UI script binds to (checkboxes, include/exclude textareas with
  backdrop layers, output box, action buttons, suggestion dropdown). *(uses
  vscode)*

### Webview UI (browser sandbox)

- **`webview-ui/main.js`** — All client behavior, talking to the host **only**
  via `postMessage`. Renders the token-highlight backdrop, drives the
  autocomplete dropdown, wires input/keyboard events (Enter = run, Shift+Enter =
  newline, arrows/Tab/Escape navigate the dropdown), debounces persistence, and
  paints results back from host messages. It deliberately mirrors the host's
  `tokenizer` so per-token highlight flags line up exactly.
- **`webview-ui/style.css`** — Visual styling built on VS Code theme variables
  so the panel matches the editor.

### Core logic

- **`core/types.ts`** — The shared vocabulary: `UiState` (every panel control,
  also the persisted shape), `GenerateResult`, and the two message unions that
  form the host↔webview protocol. Pure.
- **`core/tokenizer.ts`** — Splits a textarea value into glob/path tokens:
  whitespace-separated, with single/double quotes letting a token contain
  spaces. This is the "no shell quoting" fix over the original CLI. Pure.
- **`core/gitignoreScanner.ts`** — `collectNonIgnoredFiles` walks the tree
  applying **layered** `.gitignore` rules (via the `ignore` package), always
  skipping `.git` and symlinks. `createEmbeddingGuard` is the single chokepoint
  that decides whether one relative path may be read into context. Pure.
- **`core/patternMatcher.ts`** — `selectFiles` runs include patterns first, then
  exclude narrows them, ordering by *last matching include* so specific patterns
  land nearest the Prompt. `matchesAnyFile` answers "does this one pattern hit
  anything" for highlighting. Both use `micromatch`. Pure.
- **`core/fileGuards.ts`** — `readFileSafe` returns a placeholder instead of
  throwing for oversized (>1 MB) or binary (null-byte sniff) files, so context
  generation degrades gracefully. Pure.
- **`core/completions.ts`** — Builds autocomplete candidates (every file plus
  every parent directory, with a trailing slash) and ranks a prefix against them
  in three bands: path-prefix, then basename-prefix, then fuzzy subsequence.
  Pure.
- **`core/markdownBuilder.ts`** — Assembles the final Markdown sections —
  `# Project structure`, `## Output format` (the inlined `diff-format.md`), one
  `# <path>` block per file, and `# Prompt` — from already-read contents. Pure
  string formatting.
- **`core/generateContext.ts`** — Orchestrates *building* context:
  `generateContext` (scan → tokenize → select → read → build, with all sections)
  and `moreFiles` (parse a clipboard path list, validate every path up front,
  embed only those files with no scaffolding). Both funnel through one internal
  `buildContext`. Pure.
- **`core/diffApplier.ts`** — Parses Search/Replace blocks, fingerprints them,
  and applies them. All blocks are simulated into per-file plans first
  (all-or-nothing), then committed as a single `WorkspaceEdit` and auto-saved.
  Includes the whitespace-lenient match ladder and the path-escape guard. *(uses
  vscode: WorkspaceEdit)*
- **`core/clipboard.ts`** — Thin wrapper over `vscode.env.clipboard`
  read/write. *(uses vscode)*
- **`core/outputWriter.ts`** — Writes generated Markdown to an optional output
  file (blank means don't write; relative paths resolve against the project
  root). Pure.
- **`core/projectStorage.ts`** — Persists panel state and the last-applied diff
  fingerprint in `globalState`, keyed by the project's absolute path so it
  survives restarts and multi-root setups. *(uses vscode)*

Two supporting assets: `src/global.d.ts` declares the `*.md` text-import type
used by `markdownBuilder.ts`, and `src/core/diff-format.md` is the instruction
block that teaches the chatbot the exact Search/Replace format the applier
understands.

## The message protocol

`core/types.ts` defines two discriminant unions. The webview sends
`WebviewToHostMessage`; the host replies with `HostToWebviewMessage`. Every
request that expects a correlated reply carries a `requestId` so the UI can drop
out-of-order responses (fast typing, stale highlight results).

From webview to host:

- `stateChanged` — debounced autosave of `UiState`
- `suggest` / `highlight` — autocomplete items / token match flags
- `run` — generate context from the current state
- `moreFiles` — embed the file list on the clipboard
- `applyDiffs` — apply the Search/Replace blocks on the clipboard

From host to webview:

- `init` — persisted state plus whether a workspace is open, which drives the
  disabled buttons and the "open a folder" warning
- `suggestResult` / `highlightResult` — replies keyed by `requestId`
- `runResult` / `applyResult` — either `{ ok: true, … }` or `{ ok: false, error }`

## End-to-end flows

**Generate** — The webview posts `run` with the current state. The host saves the
state, then runs `generateContext`: scan non-ignored files, tokenize the
include/exclude boxes, `selectFiles`, read each file through the embedding guard
and `readFileSafe`, then `buildMarkdown`. The result is copied to the clipboard
and/or written to the output file per the checkboxes, and a `runResult` plus a
status-bar line report the file count.

**More Files** — Reads a newline list of relative paths from the clipboard (the
sandbox can't). `moreFiles` parses it into a deduped ordered list, then
validates **every** path against the embedding guard before touching anything:
one bad path (missing, a directory, git-ignored, outside the root) aborts the run
rather than producing partial context. Accepted files embed with **no**
structure, output-format, or prompt sections, so a mid-conversation supplement
pastes cleanly over context the chatbot has already seen.

**Apply Diffs** — Reads Search/Replace blocks from the clipboard.
`fingerprintDiff` hashes the *parsed* blocks (so line-ending and fence
differences don't change the hash); if it matches the last-applied fingerprint
for this project, the host prompts to confirm before re-applying. Otherwise
`applyDiffs` parses blocks with a line-state machine, resolves each path
(rejecting escapes out of the workspace), and simulates every edit per file —
catching no-match, ambiguous-match, edit-after-delete, and empty-SEARCH-on-existing-file
**before** any write. Only then does it commit one `WorkspaceEdit` and save each
touched file, keeping the editor undo stack (Ctrl+Z) intact as a safety net.
Fuzzy (whitespace-lenient) matches are counted and surfaced for review.

**Autocomplete & live highlighting** — As the user types in an include/exclude
box, the webview debounces a `suggest` request (ranked candidates) and a
`highlight` request. The host answers highlight flags from a cached non-ignored
file list. A `FileSystemWatcher`, debounced, drops that cache and replays the
last highlight whenever a file is created, changed, or deleted — that's what
recolors tokens in near real time (green matches something, yellow matches
nothing).

## State & persistence

There is no shared/global mutable state in the core. UI state lives as `UiState`
values that are passed around as arguments and persisted per-project via
`projectStorage` (`globalState`, keyed by a normalized absolute path). The
orchestrator's caches (`candidates`, `files`, `lastHighlight`) and its
watcher/timer are the only long-lived in-memory state, all owned in one place.
`retainContextWhenHidden` keeps the webview's own unsaved edits alive across
panel-tab switches, and a `visibilitychange` flush guarantees a debounced save
lands before the view hides.

## Safety chokepoints

Each guard is a single, unavoidable funnel.

- **Embedding guard** (`gitignoreScanner.createEmbeddingGuard`) — the one place
  that authorizes any file read feeding the Markdown, so `.gitignore`-hidden or
  out-of-root paths can never be embedded no matter which feature requested
  them. Reused by both `generateContext` and `moreFiles`.
- **File guards** (`fileGuards.readFileSafe`) — binary and >1 MB files become
  placeholders instead of bloating the output.
- **Path-escape guard** (`diffApplier.resolveFile`) — diff paths are normalized
  and confined to the workspace root before any write.
- **All-or-nothing apply** — full simulation before the first `WorkspaceEdit`, so
  a failing block leaves the tree untouched.
- **Duplicate-apply guard** — per-project fingerprint of the last applied diff.
- **CSP nonce** (`getHtml`) — the webview loads only its own local assets, and
  only scripts carrying the current nonce.

## Build & asset loading

`esbuild.js` bundles `src/extension.ts` into `dist/extension.js` (CommonJS, Node
18 platform, `vscode` marked external). `diff-format.md` is inlined as a string
at build time via the `loader: { '.md': 'text' }` rule, so nothing reads it from
disk at runtime and it never ships separately. `npm run compile` type-checks
with `tsc --noEmit`; the webview assets in `webview-ui/` are **not** bundled —
they load straight from disk, so refreshing them means reloading the panel.

## Conventions that keep this shape

- One file, one job; split rather than grow a file past a single responsibility.
- Keep UI-free logic (parsing, matching, building) free of `vscode` imports.
- Modules expose a small, stable interface and never reach into each other; only
  the orchestrator wires modules together.
- Pass values as arguments instead of adding shared/global state.
- After any change, update this file so it still matches the code.
