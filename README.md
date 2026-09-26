# ReptClip for VS Code - Fast Context for Your ChatBot

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=effessdev.reptclip-for-vscode)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-Registry-purple)](https://open-vsx.org/extension/effessdev/reptclip-for-vscode)

Turn your project into clean Markdown context for AI chatbots and copy it **straight to your clipboard**, automatically respecting `.gitignore` files.

<img width="799" alt="Preview image" src="https://github.com/user-attachments/assets/55568e7f-4c68-48bf-830a-d69684e6985c" />

> **Note:** If you are looking for the original ReptClip (the CLI version), here is the link: [ReptClip](https://github.com/effessdev/reptclip)

## How to use

1. Open the bottom panel using `` Ctrl + ` ``
2. Open the **ReptClip** tab in the panel (Click `...` if you can't see it)

## Features

- Get suggestions as you type
- Syntax highlighting
- Glob patterns for specifying files
- Project structure

Suggestions look like this:

<img width="800" alt="Suggestions preview" src="https://github.com/user-attachments/assets/44fb4f56-5015-4412-8d03-861965d803a0" />

## Supported configurations

1. **Files to include**: patterns/paths separated by spaces (e.g. `AGENTS.md src/**/*.py`). Quotes are only needed if a pattern contains a space
2. **Files to exclude**: same syntax; applied after include patterns
3. Checkboxes:
   1. **Clipboard**: copies the generated Markdown straight to your clipboard
   2. **Project structure**: includes a `# Project structure` section listing every file in the project that isn't excluded by `.gitignore`
   3. **Prompt tail**: appends `# Prompt\n\n` to the end of the output, so your cursor has somewhere to land when you paste into a chat
4. **Output file** text box (leave empty to skip writing a file; accepts relative or absolute paths)

## Note

Only files not excluded by `.gitignore` are ever considered, using layered, per-directory `.gitignore` parsing (via the `ignore` package) rather than shelling out to git.

Include/exclude patterns and checkbox settings are remembered per project, so you don't have to re-enter them every time you open the panel.

---

Thanks for reading! If you found this useful, please consider dropping a ⭐. It really helps **A LOT!**
