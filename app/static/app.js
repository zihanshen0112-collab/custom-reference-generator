/* ===================== Constants and state ===================== */

const FIELD_DEFS = [
  { key: "author",   label: "Author" },
  { key: "title",    label: "Title" },
  { key: "siteName", label: "Site Name" },
  { key: "date",     label: "Date" },
  { key: "url",      label: "URL" },
];

const state = {
  metadata: { author: "", title: "", siteName: "", date: "", url: "" },
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

/* ===================== Style editor ===================== */

function buildStyleEditor() {
  const container = $("#style-editor");
  container.innerHTML = "";

  for (const f of state.style.fields) {
    const def = FIELD_DEFS.find((d) => d.key === f.key);
    const row = document.createElement("div");
    row.className = "style-row";

    const name = document.createElement("div");
    name.className = "style-name";
    name.textContent = def.label;

    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = f.enabled;
    enabled.title = "Include this field";
    enabled.addEventListener("change", () => {
      f.enabled = enabled.checked;
      render();
    });

    const bold = document.createElement("button");
    bold.type = "button";
    bold.className = "fmt-btn" + (f.bold ? " active" : "");
    bold.style.fontWeight = "bold";
    bold.textContent = "B";
    bold.title = "Bold";
    bold.addEventListener("click", () => {
      f.bold = !f.bold;
      bold.classList.toggle("active", f.bold);
      render();
    });

    const italic = document.createElement("button");
    italic.type = "button";
    italic.className = "fmt-btn" + (f.italic ? " active" : "");
    italic.style.fontStyle = "italic";
    italic.textContent = "I";
    italic.title = "Italic";
    italic.addEventListener("click", () => {
      f.italic = !f.italic;
      italic.classList.toggle("active", f.italic);
      render();
    });

    const enc = document.createElement("select");
    enc.innerHTML =
      '<option value="">No wrapping</option>' +
      '<option value=\'"\'>Quotes ""</option>' +
      '<option value="()">Parentheses ()</option>' +
      '<option value="[]">Brackets []</option>' +
      '<option value="<>">Angle brackets &lt;&gt;</option>';
    enc.value = f.enclosure;
    enc.addEventListener("change", () => {
      f.enclosure = enc.value;
      render();
    });

    row.append(name, enabled, bold, italic, enc);
    container.appendChild(row);
  }

  document.querySelectorAll('input[name="indent"]').forEach((radio) => {
    radio.checked = radio.value === state.style.indent;
    radio.addEventListener("change", () => {
      state.style.indent = radio.value;
      render();
    });
  });
}

/* ===================== Metadata input binding ===================== */

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

/* ===================== Rendering ===================== */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function renderCitation(metadata, style) {
  const parts = [];
  const missing = [];

  for (const f of style.fields) {
    const def = FIELD_DEFS.find((d) => d.key === f.key);
    if (!f.enabled) continue;

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
    preview.innerHTML =
      '<span class="placeholder">Your citation will appear here.</span>';
  }

  const hint = $("#missing-hint");
  if (result.missing.length) {
    hint.hidden = false;
    hint.textContent =
      "Missing: " + result.missing.join(", ") +
      ". Fill them in above to include them in the citation.";
  } else {
    hint.hidden = true;
  }
}

/* ===================== Extract from URL ===================== */

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

    for (const key of ["author", "title", "siteName", "date", "url"]) {
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

/* ===================== Parse pasted citation ===================== */

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

    // 合并策略：只填空白字段，不覆盖用户已有数据
    const filled = [];
    for (const key of ["author", "title", "siteName", "date", "url"]) {
      if (!state.metadata[key] && parsed[key]) {
        state.metadata[key] = parsed[key];
        filled.push(key);
      }
    }

    refreshMetadataInputs();
    render();

    if (filled.length) {
      const labels = filled
        .map((k) => FIELD_DEFS.find((d) => d.key === k).label)
        .join(", ");
      status.textContent = "Filled: " + labels;
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

/* ===================== Copy ===================== */

async function copyCitation() {
  const { html, text } = lastResult;
  if (!text) return;

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(text);
  }

  const btn = $("#copy-btn");
  const old = btn.textContent;
  btn.textContent = "Copied.";
  setTimeout(() => (btn.textContent = old), 1500);
}

/* ===================== Init ===================== */

document.addEventListener("DOMContentLoaded", () => {
  buildStyleEditor();
  bindMetadataInputs();
  $("#extract-btn").addEventListener("click", extract);
  $("#url-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") extract();
  });
  $("#parse-btn").addEventListener("click", parsePastedCitation);
  $("#copy-btn").addEventListener("click", copyCitation);
  render();
});