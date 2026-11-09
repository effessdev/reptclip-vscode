# ARCHITECTURE

ReptClip is a VS Code webview extension that generates project context and applies Search/Replace diffs.

## Architecture

Three layers:

- **Webview UI** (`webview-ui/`): Browser-based interface. Communicates with the host through messages.
- **Host** (`src/panel/ReptclipViewProvider.ts`): Handles UI messages, coordinates core modules, and manages state and file watching.
- **Core** (`src/core/`): Handles file scanning, pattern matching, context generation, diff application, and VS Code services.

`ReptclipViewProvider.ts` is the central orchestrator; core modules expose functions and do not depend on each other.

## Key Modules

- `core/types.ts`: Shared types and UI message protocol.
- `core/gitignoreScanner.ts`, `patternMatcher.ts`, `tokenizer.ts`: Discover and select files.
- `core/generateContext.ts`, `markdownBuilder.ts`, `fileGuards.ts`: Read files safely and assemble Markdown context.
- `core/completions.ts`: Path autocomplete.
- `core/diffApplier.ts`: Validate and apply Search/Replace diffs atomically.
- `core/clipboard.ts`, `outputWriter.ts`, `projectStorage.ts`: Clipboard, output, and persistence.
- `webview-ui/main.js`: UI interactions and host communication.
- `src/panel/getHtml.ts`: Webview HTML and security policy.
