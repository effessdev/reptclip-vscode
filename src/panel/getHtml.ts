import * as vscode from "vscode";

export function getHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "webview-ui", "main.js"),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "webview-ui", "style.css"),
  );
  const nonce = getNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
  />
  <link href="${styleUri}" rel="stylesheet" />
  <title>ReptClip</title>
</head>
<body>
  <div id="warning" class="warning" hidden>Open a folder to use ReptClip.</div>

  <section class="section">
    <label for="include">Files to include (separated by spaces, glob patterns supported)</label>
    <textarea
      id="include"
      rows="2"
      spellcheck="false"
      placeholder='AGENTS.md src/**/*.py "name with space.md"'
    ></textarea>
  </section>

  <section class="section">
    <label for="exclude">Files to exclude from included files</label>
    <textarea
      id="exclude"
      rows="2"
      spellcheck="false"
      placeholder="src/secret.py"
    ></textarea>
  </section>

  <section class="section checkboxes">
    <label>Click Generate or press enter inside an input to copy</label>
    <label class="checkbox">
      <input type="checkbox" id="clipboard" />
      <span>Clipboard</span>
    </label>
    <label class="checkbox">
      <input type="checkbox" id="structure" />
      <span>Project structure</span>
    </label>
    <label class="checkbox">
      <input type="checkbox" id="promptTail" />
      <span>Prompt tail</span>
    </label>
    <label class="output-file">
      <span>Output file</span>
      <input type="text" id="output" spellcheck="false" placeholder="out.md" />
    </label>
  </section>

  <div class="actions">
    <button id="runBtn" type="button">Generate</button>
    <span id="status" class="status" aria-live="polite"></span>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
