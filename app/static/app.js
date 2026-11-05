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

const EXAMPLE_METADATA = {
  author: "Smith, John, and Jane Doe, and Robert Johnson",
  title: "The Comprehensive Guide to Citation Generation and Formatting Standards in Modern Academic Writing",
  siteName: "International Journal of Reference Studies",
  publisher: "Academic Press",
  date: "2024-05-15",
  accessDate: "2026-11-04",
  url: "https://example.com/journal/article/12345",
  container: "Journal of Citation Science"
};

// 唯一 ID 生成器，用于支持重复添加相同的 key
let fieldIdCounter = 0;
function createField(key) {
  return {
    id: ++fieldIdCounter,
    key: key,
    enabled: true,
    bold: false,
    italic: false,
    enclosure: ""
  };
}

const state = {
  metadata: { 
    author: "", title: "", siteName: "", publisher: "", 
    date: "", accessDate: "", url: "", container: "" 
  },
  style: {
    fields: [
      createField("author"),
      createField("title"),
      createField("siteName"),
      createField("date"),
      createField("url")
    ],
    indent: "none",
    separator: ", ",
  },
};

let lastResult = { html: "", text: "" };
const $ = (sel) => document.querySelector(sel);

const PRESETS = {
  apa: {
    fields: [
      createField("author"),
      createField("date"),
      createField("title"),
      createField("siteName"),
      createField("url")
    ],
    indent: "hanging",
    separator: ". "
  },
  mla: {
    fields: [
      createField("author"),
      createField("title"),
      createField("container"),
      createField("publisher"),
      createField("date"),
      createField("url")
    ],
    indent: "hanging",
    separator: ". "
  }
};

// 手动调整 APA/MLA 预设中的特定样式（如将 title 设为斜体）
PRESETS.apa.fields[2].italic = true;
PRESETS.mla.fields[1].enclosure = '"';
PRESETS.mla.fields[2].italic = true;

/* ===================== 样式编辑器 ===================== */

let sortableInstance = null;

function buildStyleEditor() {
  const container = $("#style-editor");
  container.innerHTML = "";

  // 填充下拉菜单
  const addSelect = $("#add-element-select");
  addSelect.innerHTML = '<option value="" disabled selected>+ Add element</option>';
  AVAILABLE_FIELDS.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.key;
    opt.textContent = f.label;
    addSelect.appendChild(opt);
  });

  for (const f of state.style.fields) {
    const def = AVAILABLE_FIELDS.find((d) => d.key === f.key);
    if (!def) continue;

    const row = document.createElement("div");
    row.className = "style-row";
    row.dataset.id = f.id; // 使用唯一 ID 标识 DOM

    const drag = document.createElement("div");
    drag.className = "drag-handle";
    drag.textContent = "≡";

    const name = document.createElement("div");
    name.className = "style-name";
    name.textContent = def.label;

    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = f.enabled;
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
    del.addEventListener("click", () => {
      // 根据唯一 ID 删除
      state.style.fields = state.style.fields.filter(item => item.id !== f.id);
      buildStyleEditor();
      render();
    });

    row.append(drag, name, enabled, bold, italic, enc, del);
    container.appendChild(row);
  }

  if (typeof Sortable !== "undefined") {
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(container, {
      handle: ".drag-handle",
      animation: 150,
      onEnd: function () {
        const newOrder = [];
        container.querySelectorAll(".style-row").forEach(row => {
          const id = parseInt(row.dataset.id, 10);
          const field = state.style.fields.find(f => f.id === id);
          if (field) newOrder.push(field);
        });
        state.style.fields = newOrder;
        render();
      }
    });
  }

  document.querySelectorAll('input[name="indent"]').forEach((radio) => {
    radio.checked = radio.value === state.style.indent;
    radio.addEventListener("change", () => {
      state.style.indent = radio.value;
      render();
    });
  });
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

  const sep = style.separator !== undefined ? style.separator : ", ";
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

function renderExample() {
  const result = renderCitation(EXAMPLE_METADATA, state.style);
  const container = $("#format-example");
  
  if (result.text) {
    container.innerHTML = result.html;
  } else {
    container.innerHTML = '<span style="color:#9ca3af;font-style:italic;">All fields are disabled. Enable some to see the example.</span>';
  }
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

  renderExample();
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

  // 监听下拉菜单的选择
  $("#add-element-select").addEventListener("change", (e) => {
    const key = e.target.value;
    if (!key) return;

    const existingCount = state.style.fields.filter(f => f.key === key).length;
    
    // 如果已经存在，提示用户确认
    if (existingCount > 0) {
      const label = AVAILABLE_FIELDS.find(f => f.key === key).label;
      const confirmMsg = `"${label}" is already in the format. Do you want to add it again?`;
      if (!confirm(confirmMsg)) {
        e.target.value = ""; // 重置选择
        return;
      }
    }

    // 添加新元素
    state.style.fields.push(createField(key));
    buildStyleEditor();
    render();
    e.target.value = ""; // 重置选择状态
  });

  $("#preset-select").addEventListener("change", (e) => {
    const val = e.target.value;
    if (PRESETS[val]) {
      // 由于 PRESETS 中已经是深拷贝过的对象，这里直接重新生成唯一 ID
      state.style.fields = PRESETS[val].fields.map(f => ({
        id: ++fieldIdCounter,
        key: f.key,
        enabled: f.enabled,
        bold: f.bold,
        italic: f.italic,
        enclosure: f.enclosure
      }));
      
      state.style.indent = PRESETS[val].indent;
      state.style.separator = PRESETS[val].separator;
      
      $("#separator-input").value = state.style.separator;
      document.querySelectorAll('input[name="indent"]').forEach(radio => {
        radio.checked = radio.value === state.style.indent;
      });

      buildStyleEditor();
      render();
    }
  });

  $("#separator-input").addEventListener("input", (e) => {
    state.style.separator = e.target.value;
    render();
  });

  $("#extract-btn").addEventListener("click", extract);
  $("#url-input").addEventListener("keydown", (e) => { if (e.key === "Enter") extract(); });
  $("#parse-btn").addEventListener("click", parsePastedCitation);
  $("#copy-btn").addEventListener("click", copyCitation);
});