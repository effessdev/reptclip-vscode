// Runs inside the webview sandbox. Talks to the extension host purely via
// postMessage — no direct filesystem/clipboard access from here.
(function () {
  const vscode = acquireVsCodeApi();

  const els = {
    include: document.getElementById("include"),
    exclude: document.getElementById("exclude"),
    clipboard: document.getElementById("clipboard"),
    structure: document.getElementById("structure"),
    promptTail: document.getElementById("promptTail"),
    output: document.getElementById("output"),
    runBtn: document.getElementById("runBtn"),
    status: document.getElementById("status"),
    warning: document.getElementById("warning"),
  };

  function currentState() {
    return {
      include: els.include.value,
      exclude: els.exclude.value,
      clipboard: els.clipboard.checked,
      projectStructure: els.structure.checked,
      promptTail: els.promptTail.checked,
      outputFile: els.output.value,
    };
  }

  function debounce(fn, waitMs) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), waitMs);
    };
  }

  function persist() {
    vscode.postMessage({ type: "stateChanged", state: currentState() });
  }
  const persistDebounced = debounce(persist, 300);

  function run() {
    els.status.textContent = "Working…";
    vscode.postMessage({ type: "run", state: currentState() });
  }

  [els.include, els.exclude, els.output].forEach((el) => {
    el.addEventListener("input", persistDebounced);
  });
  [els.clipboard, els.structure, els.promptTail].forEach((el) => {
    el.addEventListener("change", persist);
  });

  // Enter runs the task from either pattern box; Shift+Enter still inserts
  // a newline in case someone wants to lay patterns out across lines.
  [els.include, els.exclude].forEach((el) => {
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        run();
      }
    });
  });

  els.runBtn.addEventListener("click", run);

  window.addEventListener("message", (event) => {
    const message = event.data;

    if (message.type === "init") {
      const s = message.state;
      els.include.value = s.include ?? "";
      els.exclude.value = s.exclude ?? "";
      els.clipboard.checked = !!s.clipboard;
      els.structure.checked = !!s.projectStructure;
      els.promptTail.checked = !!s.promptTail;
      els.output.value = s.outputFile ?? "";
      els.warning.hidden = message.hasWorkspace;
      els.runBtn.disabled = !message.hasWorkspace;
      return;
    }

    if (message.type === "runResult") {
      els.status.textContent = message.ok
        ? `Done: ${message.fileCount} file(s) included.`
        : `Error: ${message.error}`;
    }
  });
})();
