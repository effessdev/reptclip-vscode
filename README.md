# ReptClip for VS Code

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=effessdev.reptclip-for-vscode)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-Registry-purple)](https://open-vsx.org/extension/effessdev/reptclip-for-vscode)

Paste your project as clean Markdown context into a free Chatbot, and apply the generated diffs in one click!

<img width="1447" alt="image" src="https://github.com/user-attachments/assets/5ff87216-785f-48a5-851c-4d24e8369ad4" />

> **Note:** If you are looking for the original ReptClip (the CLI version), here is the link: [ReptClip](https://github.com/effessdev/reptclip)

## Workflow

1. Specify the files you want to include in the context and press "Enter" to copy it into your clipboard
3. Paste it into a free chatbot along with your prompt, and let it generate the diffs
4. Copy the code block containing the diffs, and click "Apply Diffs"

The extension will automatically read the diffs from your clipboard and update the files accordingly!

## How to use

1. Install the extension
2. Open the bottom panel using `` Ctrl + ` ``
3. Open the **ReptClip** tab in the panel (Click `...` if you can't see it)

## Other features

- Get suggestions as you type
- Syntax highlighting
- Glob patterns for specifying files
- Project structure
- Revert a diff by clicking "Restore"
- Automatically respects `.gitignore` files

Suggestions look like this:

<img width="1441" alt="image" src="https://github.com/user-attachments/assets/e1f4b96c-de03-421d-8f12-b89308176951" />

## Supported configurations

1. **Files to include**: patterns/paths separated by spaces (e.g. `AGENTS.md src/**/*.py`). Quotes are only needed if a pattern contains a space. Order is preserved.
2. **Files to exclude**: same syntax; applied after include patterns.
3. Checkboxes:
   1. **Clipboard**: copies the generated Markdown straight to your clipboard.
   2. **Project structure**: includes a `# Project structure` section listing every file in the project that isn't excluded by `.gitignore`.
   3. **Prompt tail**: appends `# Prompt\n\n` to the end of the output, so your cursor has somewhere to land when you paste into a chat.
   4. **Diff format**: adds instructions regarding how to generate the diffs.
4. **Output file** text box (leave empty to skip writing a file; accepts relative or absolute paths).

## Note

Only files not excluded by `.gitignore` are ever considered, using layered, per-directory `.gitignore` parsing (via the `ignore` package) rather than shelling out to git.

Include/exclude patterns and checkbox settings are remembered per project, so you don't have to re-enter them every time you open the panel.

---

Thanks for reading! If you found this useful, please consider dropping a ⭐. It really helps **A LOT!**
