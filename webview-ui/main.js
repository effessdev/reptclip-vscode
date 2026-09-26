// Runs inside the webview sandbox. Talks to the extension host purely via
// postMessage — no direct filesystem/clipboard access from here.
(function () {
  const vscode = acquireVsCodeApi();

  const els = {
    include: document.getElementById("include"),
    exclude: document.getElementById("exclude"),
    clipboard: document.getElementById("clipboard"),
    structure: document.getElementById("structure"),
    diffFormat: document.getElementById("diffFormat"),
    promptTail: document.getElementById("promptTail"),
    output: document.getElementById("output"),
    runBtn: document.getElementById("runBtn"),
    applyBtn: document.getElementById("applyBtn"),
    status: document.getElementById("status"),
    warning: document.getElementById("warning"),
    suggest: document.getElementById("suggest"),
    includeBackdrop: document.getElementById("include-backdrop"),
    excludeBackdrop: document.getElementById("exclude-backdrop"),
  };

  // The include/exclude boxes drive autocomplete; the output box does not.
  const patternFields = [els.include, els.exclude];

  // --- Token highlighting -------------------------------------------------
  // Textareas can't color individual tokens, so a read-only "backdrop" div
  // sits behind each one (with transparent textarea text on top) and mirrors
  // its content with a colored span per pattern token. A token turns green
  // when it matches at least one file, yellow when it matches none.
  const editors = new Map([
    [
      els.include,
      { key: "include", input: els.include, backdrop: els.includeBackdrop },
    ],
    [
      els.exclude,
      { key: "exclude", input: els.exclude, backdrop: els.excludeBackdrop },
    ],
  ]);

  const highlightState = {
    requestId: 0,
    flags: { include: [], exclude: [] },
  };

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (c) =>
      c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;",
    );
  }

  // Mirrors the extension host's tokenizer: whitespace separates tokens and
  // quotes let a token contain spaces (quotes stripped from the returned text).
  // Also records each token's raw [start, end) range so the backdrop can wrap
  // the exact typed characters (quotes included) in a colored span. Keeping
  // this in lockstep with the host guarantees flag indices line up.
  function scanTokens(input) {
    const tokens = [];
    let i = 0;
    let start = -1;
    let text = "";
    const flush = (end) => {
      if (start !== -1 && text.length > 0) {
        tokens.push({ start, end, text });
      }
      start = -1;
      text = "";
    };
    while (i < input.length) {
      const ch = input[i];
      if (ch === '"' || ch === "'") {
        if (start === -1) {
          start = i;
        }
        let j = i + 1;
        while (j < input.length && input[j] !== ch) {
          text += input[j];
          j++;
        }
        i = j + 1; // skip the closing quote (or run past EOF)
        continue;
      }
      if (/\s/.test(ch)) {
        flush(i);
        i++;
        continue;
      }
      if (start === -1) {
        start = i;
      }
      text += ch;
      i++;
    }
    flush(input.length);
    return tokens;
  }

  function renderBackdrop(editor) {
    const { input, backdrop, key } = editor;
    if (!backdrop) {
      return;
    }
    const flags = highlightState.flags[key];
    const tokens = scanTokens(input.value);
    let html = "";
    let pos = 0;
    tokens.forEach((t, idx) => {
      html += escapeHtml(input.value.slice(pos, t.start));
      const cls =
        idx < flags.length ? (flags[idx] ? "hl-match" : "hl-nomatch") : "";
      const body = escapeHtml(input.value.slice(t.start, t.end));
      html += cls ? `<span class="${cls}">${body}</span>` : body;
      pos = t.end;
    });
    html += escapeHtml(input.value.slice(pos));
    backdrop.innerHTML = html;
    backdrop.scrollTop = input.scrollTop;
  }

  function requestHighlight() {
    const requestId = ++highlightState.requestId;
    vscode.postMessage({
      type: "highlight",
      requestId,
      include: els.include.value,
      exclude: els.exclude.value,
    });
  }
  const requestHighlightDebounced = debounce(requestHighlight, 200);

  const completion = {
    el: null, // textarea the dropdown is attached to
    items: [], // current suggestion strings
    index: -1, // highlighted item
    start: 0, // cursor offset where the active token began
    requestId: 0, // guards against out-of-order suggestResult replies
  };

  function currentState() {
    return {
      include: els.include.value,
      exclude: els.exclude.value,
      clipboard: els.clipboard.checked,
      projectStructure: els.structure.checked,
      diffFormat: els.diffFormat.checked,
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

  // The host reads the clipboard (the webview sandbox has no clipboard
  // access) and applies the Search/Replace blocks it finds there.
  function applyFromClipboard() {
    els.status.textContent = "Applying…";
    vscode.postMessage({ type: "applyDiffs" });
  }

  // --- Autocomplete -------------------------------------------------------

  // Returns the token under the caret: where it starts and the prefix typed so
  // far. A token is bounded by whitespace or a quote on either side.
  function tokenAtCursor(el) {
    const text = el.value;
    const cursor = el.selectionStart;
    let i = cursor - 1;
    while (i >= 0 && !/[\s"']/.test(text[i])) {
      i--;
    }
    return { start: i + 1, prefix: text.slice(i + 1, cursor) };
  }

  function hideSuggestions() {
    els.suggest.hidden = true;
    completion.items = [];
    completion.index = -1;
    completion.el = null;
  }

  function requestSuggestions(el) {
    const { start, prefix } = tokenAtCursor(el);
    completion.el = el;
    completion.start = start;

    if (!prefix) {
      hideSuggestions();
      return;
    }

    const requestId = ++completion.requestId;
    vscode.postMessage({ type: "suggest", requestId, prefix });
  }
  const requestSuggestionsDebounced = debounce(requestSuggestions, 120);

  // Splits a candidate path into its directory prefix and final segment so
  // the dropdown can de-emphasize the folder part (matters now that
  // suggestions can match by file name deep in the tree).
  function splitPath(item) {
    const cut = item.endsWith("/") ? item.length - 1 : item.length;
    const slash = item.lastIndexOf("/", cut - 1);
    return slash === -1
      ? { dir: "", name: item }
      : { dir: item.slice(0, slash + 1), name: item.slice(slash + 1) };
  }

  function renderSuggestions(items) {
    const el = completion.el;
    if (!el) {
      return;
    }

    completion.items = items;
    completion.index = items.length > 0 ? 0 : -1;

    while (els.suggest.firstChild) {
      els.suggest.removeChild(els.suggest.firstChild);
    }
    items.forEach((item, idx) => {
      const isFolder = item.endsWith("/");
      const row = document.createElement("div");
      row.className = "item" + (idx === completion.index ? " active" : "");
      row.setAttribute("role", "option");

      const label = document.createElement("span");
      const { dir, name } = splitPath(item);
      if (dir) {
        const dirSpan = document.createElement("span");
        dirSpan.className = "dir";
        dirSpan.textContent = dir;
        label.appendChild(dirSpan);
      }
      const nameSpan = document.createElement("span");
      nameSpan.className = "name";
      nameSpan.textContent = name;
      label.appendChild(nameSpan);

      const kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = isFolder ? "folder" : "file";

      row.append(label, kind);
      // mousedown (not click) so it fires before the textarea loses focus.
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        acceptSuggestion(idx);
      });
      els.suggest.appendChild(row);
    });

    if (items.length === 0) {
      hideSuggestions();
      return;
    }

    positionSuggestions(el);
    els.suggest.hidden = false;
  }

  function positionSuggestions(el) {
    const rect = el.getBoundingClientRect();
    els.suggest.style.left = `${rect.left + window.scrollX}px`;
    els.suggest.style.top = `${rect.bottom + window.scrollY + 2}px`;
    els.suggest.style.width = `${rect.width}px`;
  }

  function highlight(index) {
    const rows = els.suggest.querySelectorAll(".item");
    if (rows.length === 0) {
      return;
    }
    completion.index = (index + rows.length) % rows.length;
    rows.forEach((row, i) =>
      row.classList.toggle("active", i === completion.index),
    );
    rows[completion.index].scrollIntoView({ block: "nearest" });
  }

  function acceptSuggestion(index = completion.index) {
    const el = completion.el;
    const item = completion.items[index];
    if (!el || item === undefined) {
      return;
    }

    const text = el.value;
    const caret = el.selectionStart;
    const before = text.slice(0, completion.start);
    const after = text.slice(caret);
    const newValue = before + item + after;

    el.value = newValue;
    const newCaret = completion.start + item.length;
    el.focus();
    el.setSelectionRange(newCaret, newCaret);

    persist();
    hideSuggestions();
    renderBackdrop(editors.get(el));
    requestHighlightDebounced();

    // Choosing a folder should immediately offer its contents.
    if (item.endsWith("/")) {
      requestSuggestions(el);
    }
  }

  // --- Event wiring -------------------------------------------------------

  patternFields.forEach((el) => {
    el.addEventListener("input", () => {
      persistDebounced();
      requestSuggestionsDebounced(el);
      renderBackdrop(editors.get(el));
      requestHighlightDebounced();
    });

    // Enter runs the task; Shift+Enter inserts a newline. While the dropdown is
    // open, arrows navigate and Enter/Tab accept instead of running.
    el.addEventListener("keydown", (event) => {
      const open = !els.suggest.hidden && completion.items.length > 0;

      if (open && event.key === "ArrowDown") {
        event.preventDefault();
        highlight(completion.index + 1);
        return;
      }
      if (open && event.key === "ArrowUp") {
        event.preventDefault();
        highlight(completion.index - 1);
        return;
      }
      if (open && (event.key === "Enter" || event.key === "Tab")) {
        event.preventDefault();
        acceptSuggestion();
        return;
      }
      if (event.key === "Escape") {
        if (open) {
          event.preventDefault();
          hideSuggestions();
        }
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        run();
      }
    });

    el.addEventListener("blur", () => {
      // Give a pending mousedown on a row a chance to fire first.
      setTimeout(hideSuggestions, 120);
    });

    // Keep the backdrop aligned when the textarea scrolls internally.
    el.addEventListener("scroll", () => {
      const editor = editors.get(el);
      if (editor && editor.backdrop) {
        editor.backdrop.scrollTop = el.scrollTop;
      }
    });
  });

  els.output.addEventListener("input", persistDebounced);
  [els.clipboard, els.structure, els.diffFormat, els.promptTail].forEach(
    (el) => {
      el.addEventListener("change", persist);
    },
  );

  els.runBtn.addEventListener("click", run);
  els.applyBtn.addEventListener("click", applyFromClipboard);

  window.addEventListener("message", (event) => {
    const message = event.data;

    if (message.type === "init") {
      const s = message.state;
      els.include.value = s.include ?? "";
      els.exclude.value = s.exclude ?? "";
      els.clipboard.checked = !!s.clipboard;
      els.structure.checked = !!s.projectStructure;
      els.diffFormat.checked = !!s.diffFormat;
      els.promptTail.checked = !!s.promptTail;
      els.output.value = s.outputFile ?? "";
      els.warning.hidden = message.hasWorkspace;
      els.runBtn.disabled = !message.hasWorkspace;
      els.applyBtn.disabled = !message.hasWorkspace;
      editors.forEach(renderBackdrop);
      if (message.hasWorkspace) {
        requestHighlight();
      }
      return;
    }

    if (message.type === "highlightResult") {
      if (message.requestId === highlightState.requestId) {
        highlightState.flags.include = message.include ?? [];
        highlightState.flags.exclude = message.exclude ?? [];
        editors.forEach(renderBackdrop);
      }
      return;
    }

    if (message.type === "suggestResult") {
      if (message.requestId === completion.requestId) {
        renderSuggestions(message.items);
      }
      return;
    }

    if (message.type === "runResult") {
      els.status.textContent = message.ok
        ? `Done: ${message.fileCount} file(s) included.`
        : `Error: ${message.error}`;
    }

    if (message.type === "applyResult") {
      els.status.textContent = message.ok
        ? `Applied: ${message.modified} modified, ${message.created} created, ${message.deleted} deleted.`
        : `Error: ${message.error}`;
    }
  });
})();
