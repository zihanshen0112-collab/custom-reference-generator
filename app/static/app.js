/* ===================== Constants and state ===================== */

const AVAILABLE_FIELDS = [
  { key: "author",     label: "Author" },
  { key: "title",      label: "Title" },
  { key: "siteName",   label: "Site Name" },
  { key: "publisher",  label: "Publisher" },
  { key: "date",       label: "Date" },
  { key: "accessDate", label: "Access Date" },
  { key: "url",        label: "URL" },
  { key: "container",  label: "Container" },
];

const state = {
  metadata: { 
    author: "", title: "", siteName: "", publisher: "", 
    date: "", accessDate: "", url: "", container: "" 
  },
  style: {
    fields: [
      { key: "author",   enabled: true, bold: false, italic: false, enclosure: "" },
      { key: "title",    enabled: true, bold: false, italic: true,  enclosure: '"' },
      { key: "siteName", enabled: true, bold: false, italic: false, enclosure: "" },
      { key: "date",     enabled: true, bold: false, italic: false, enclosure: "()" },
      { key: "url",      enabled: true, bold: false, italic: false, enclosure: "" },
    ],
    indent: "none",
    separator: ", ",
  },
};

let lastResult = { html: "", text: "" };
const $ = (sel) => document.querySelector(sel);

const PRESETS = {
  apa: [
    { key: "author", enabled: true, bold: false, italic: false, enclosure: "" },
    { key: "date", enabled: true, bold: false, italic: false, enclosure: "()" },
    { key: "title", enabled: true, bold: false, italic: true, enclosure: "" },
    { key: "siteName", enabled: true, bold: false, italic: false, enclosure: "" },
    { key: "url", enabled: true, bold: false, italic: false, enclosure: "" },
  ],
  mla: [
    { key: "author", enabled: true, bold: false, italic: false, enclosure: "" },
    { key: "title", enabled: true, bold: false, italic: false, enclosure: '"' },
    { key: "container", enabled: true, bold: false, italic: true, enclosure: "" },
    { key: "publisher", enabled: true, bold: false, italic: false, enclosure: "" },
    { key: "date", enabled: true, bold: false, italic: false, enclosure: "" },
    { key: "url", enabled: true, bold: false, italic: false, enclosure: "" },
  ]
};

/* ===================== 样式编辑器 ===================== */

let sortableInstance = null;

function buildStyleEditor() {
  const container = $("#style-editor");
  container.innerHTML = "";

  for (const f of state.style.fields) {
    const def = AVAILABLE_FIELDS.find((d) => d.key === f.key);
    if (!def) continue;

    const row = document.createElement("div");
    row.className = "style-row";
    row.dataset.key = f.key;

    const drag = document.createElement("div");
    drag.className = "drag-handle";
    drag.textContent = "≡";

    const name = document.createElement("div");
    name.className = "style-name";
    name.textContent = def.label;

    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = f.enabled;
    enabled.title = "Include this field";
    enabled.addEventListener("change", () => { f.enabled = enabled.checked; render(); });

    const bold = document.createElement("button");
    bold.type = "button";
    bold.className = "fmt-btn" + (f.bold ? " active" : "");
    bold.style.fontWeight = "bold";
    bold.textContent = "B";
    bold.addEventListener("click", () => { f.bold = !f.bold; bold.classList.toggle("active", f.bold); render(); });

    const italic = document.createElement("button");
    italic.type = "button";
    italic.className = "fmt-btn" + (f.italic ? " active" : "");
    italic.style.fontStyle = "italic";
    italic.textContent = "I";
    italic.addEventListener("click", () => { f.italic = !f.italic; italic.classList.toggle("active", f.italic); render(); });

    const enc = document.createElement("select");
    enc.innerHTML = `
      <option value="">No wrapping</option>
      <option value='"'>Quotes ""</option>
      <option value="()">Parentheses ()</option>
      <option value="[]">Brackets []</option>
      <option value="<>">Angle brackets &lt;&gt;</option>
    `;
    enc.value = f.enclosure;
    enc.addEventListener("change", () => { f.enclosure = enc.value; render(); });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete-btn";
    del.textContent = "×";
    del.title = "Remove this field";
    del.addEventListener("click", () => {
      state.style.fields = state.style.fields.filter(item => item.key !== f.key);
      buildStyleEditor();
      render();
    });

    row.append(drag, name, enabled, bold, italic, enc, del);
    container.appendChild(row);
  }

  // 安全检查：如果 Sortable 没加载出来（比如国内 CDN 被墙），跳过拖拽，不报错阻断页面
  if (typeof Sortable !== "undefined") {
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(container, {
      handle: ".drag-handle",
      animation: 150,
      onEnd: function () {
        const newOrder = [];
        container.querySelectorAll(".style-row").forEach(row => {
          const key = row.dataset.key;
          const field = state.style.fields.find(f => f.key === key);
          if (field) newOrder.push(field);
        });
        state.style.fields = newOrder;
        render();
      }
    });
  } else {
    console.warn("SortableJS failed to load. Drag-and-drop disabled.");
    container.querySelectorAll(".drag-handle").forEach(h => h.style.display = "none");
  }

  document.querySelectorAll('input[name="indent"]').forEach((radio) => {
    radio.checked = radio.value === state.style.indent;
    radio.addEventListener("change", () => {
      state.style.indent = radio.value;
      render();
    });
  });
}

function addElement() {
  const currentKeys = state.style.fields.map(f => f.key);
  const remaining = AVAILABLE_FIELDS.filter(f => !currentKeys.includes(f.key));

  if (remaining.length === 0) {
    alert("All available elements have been added.");
    return;
  }

  // 自动添加第一个未使用的字段
  state.style.fields.push({ key: remaining[0].key, enabled: true, bold: false, italic: false, enclosure: "" });
  buildStyleEditor();
  render();
}

/* ===================== 渲染 ===================== */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderCitation(metadata, style) {
  const parts = [];
  const missing = [];

  for (const f of style.fields) {
    const def = AVAILABLE_FIELDS.find((d) => d.key === f.key);
    if (!f.enabled || !def) continue;

    const value = String(metadata[f.key] || "").trim();
    if (!value) {
      missing.push(def.label);
      continue;
    }

    let text = value;
    switch (f.enclosure) {
      case '"':  text = `"${text}"`; break;
      case "()": text = `(${text})`; break;
      case "[]": text = `[${text}]`; break;
      case "<>": text = `<${text}>`; break;
    }

    let html = escapeHtml(text);
    if (f.italic) html = `<em>${html}</em>`;
    if (f.bold)   html = `<strong>${html}</strong>`;

    parts.push({ html, text });
  }

  const sep = style.separator || ", ";
  let htmlOut = parts.map((p) => p.html).join(sep);
  const textOut = parts.map((p) => p.text).join(sep);

  if (style.indent === "hanging") {
    htmlOut = `<p style="padding-left:2em; text-indent:-2em;">${htmlOut}</p>`;
  } else if (style.indent === "first-line") {
    htmlOut = `<p style="text-indent:2em;">${htmlOut}</p>`;
  } else {
    htmlOut = `<p>${htmlOut}</p>`;
  }

  return { html: htmlOut, text: textOut, missing };
}

function render() {
  const result = renderCitation(state.metadata, state.style);
  lastResult = { html: result.html, text: result.text };

  const preview = $("#preview");
  if (result.text) {
    preview.innerHTML = result.html;
  } else {
    preview.innerHTML = '<span class="placeholder">Your citation will appear here.</span>';
  }

  const hint = $("#missing-hint");
  if (result.missing.length) {
    hint.hidden = false;
    hint.textContent = "Missing: " + result.missing.join(", ") + ". Fill them in above.";
  } else {
    hint.hidden = true;
  }
}

/* ===================== 数据绑定与 API ===================== */

function bindMetadataInputs() {
  document.querySelectorAll("#metadata-panel input[data-key]").forEach((inp) => {
    inp.addEventListener("input", () => {
      state.metadata[inp.dataset.key] = inp.value;
      render();
    });
  });
}

function refreshMetadataInputs() {
  document.querySelectorAll("#metadata-panel input[data-key]").forEach((inp) => {
    inp.value = state.metadata[inp.dataset.key] || "";
  });
}

async function extract() {
  const url = $("#url-input").value.trim();
  if (!url) return;

  const btn = $("#extract-btn");
  const status = $("#extract-status");
  btn.disabled = true;
  status.textContent = "Extracting...";
  status.className = "status loading";

  try {
    const resp = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await resp.json();

    if (data.error) {
      status.textContent = "Failed: " + data.error;
      status.className = "status error";
    } else {
      status.textContent = "Done.";
      status.className = "status success";
    }

    for (const key of Object.keys(state.metadata)) {
      if (data[key]) state.metadata[key] = data[key];
    }
    if (!state.metadata.url) state.metadata.url = url;

    refreshMetadataInputs();
    render();
  } catch (err) {
    status.textContent = "Request failed: " + err.message;
    status.className = "status error";
  } finally {
    btn.disabled = false;
  }
}

async function parsePastedCitation() {
  const text = $("#paste-input").value.trim();
  if (!text) return;

  const btn = $("#parse-btn");
  const status = $("#parse-status");
  btn.disabled = true;
  status.textContent = "Parsing...";
  status.className = "status loading";

  try {
    const resp = await fetch("/api/parse-citation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const parsed = await resp.json();

    const filled = [];
    for (const key of Object.keys(state.metadata)) {
      if (!state.metadata[key] && parsed[key]) {
        state.metadata[key] = parsed[key];
        filled.push(key);
      }
    }

    refreshMetadataInputs();
    render();

    if (filled.length) {
      status.textContent = "Filled: " + filled.join(", ");
      status.className = "status success";
    } else {
      status.textContent = "Nothing new to fill.";
      status.className = "status loading";
    }
  } catch (err) {
    status.textContent = "Request failed: " + err.message;
    status.className = "status error";
  } finally {
    btn.disabled = false;
  }
}

async function copyCitation() {
  const { html, text } = lastResult;
  if (!text) return;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) }),
    ]);
  } catch {
    await navigator.clipboard.writeText(text);
  }
  const btn = $("#copy-btn");
  const old = btn.textContent;
  btn.textContent = "Copied.";
  setTimeout(() => (btn.textContent = old), 1500);
}

/* ===================== 初始化 ===================== */

document.addEventListener("DOMContentLoaded", () => {
  buildStyleEditor();
  bindMetadataInputs();
  render();

  $("#preset-select").addEventListener("change", (e) => {
    const val = e.target.value;
    if (val === "apa" || val === "mla") {
      state.style.fields = JSON.parse(JSON.stringify(PRESETS[val]));
      buildStyleEditor();
      render();
    }
  });

  $("#separator-input").addEventListener("input", (e) => {
    state.style.separator = e.target.value;
    render();
  });

  $("#add-element-btn").addEventListener("click", addElement);
  $("#extract-btn").addEventListener("click", extract);
  $("#url-input").addEventListener("keydown", (e) => { if (e.key === "Enter") extract(); });
  $("#parse-btn").addEventListener("click", parsePastedCitation);
  $("#copy-btn").addEventListener("click", copyCitation);
});