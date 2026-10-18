## Setup

```bash
npm install
npm run watch     # bundles src/extension.ts -> dist/extension.js and watches for changes
```

Then press **F5** in VS Code (or Run ▸ Start Debugging) to launch an Extension Development
Host with ReptClip loaded. Open a folder there and use the ReptClip panel.

To produce an installable `.vsix`:

1. Update version number in `package.json`
2. Run `npm install` to update `package-lock.json`
3. Run the following commands:

```bash
npm run build
npx vsce package
```
