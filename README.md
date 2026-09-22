# ReptClip for VS Code - Fast Context for Your ChatBot

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=effessdev.reptclip-vscode)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-Registry-purple)](https://open-vsx.org/extension/effessdev/reptclip-vscode)

Turn your project into clean Markdown context for AI chatbots and copy it **straight to your clipboard**, automatically respecting `.gitignore` files.

<img width="100%" alt="Preview image" src="https://github.com/user-attachments/assets/ef14392e-3fee-4451-b74c-b8fbd8d2f2a0" />

<br>

> **Note:** If you are looking for the original ReptClip (the CLI version), here is the link: [ReptClip](https://github.com/effessdev/reptclip)

## Using it

1. Open the bottom panel using `` Ctrl + ` ``
2. Open the **ReptClip** tab in the panel (Click `...` if you can't see it)
3. **Files to include**: patterns/paths separated by spaces (e.g. `AGENTS.md src/**/*.py`). Quotes are only needed if a pattern contains a space
4. **Files to exclude**: same syntax; applied after include patterns
5. Checkboxes:
   1. **Clipboard**: copies the generated Markdown straight to your clipboard
   2. **Project structure**: includes a `# Project structure` section listing every file in the project that isn't excluded by `.gitignore`
   3. **Prompt tail**: appends `# Prompt\n\n` to the end of the output, so your cursor has somewhere to land when you paste into a chat
   4. **Output file** text box (leave empty to skip writing a file; accepts relative or absolute paths)
6. Click **Generate**, or press **Enter** while focused in either pattern box (Shift+Enter for a literal newline instead)

Only files not excluded by `.gitignore` are ever considered, using layered, per-directory `.gitignore` parsing (via the `ignore` package) rather than shelling out to git.

Include/exclude patterns and checkbox settings are remembered per project, so you don't have to re-enter them every time you open the panel.
