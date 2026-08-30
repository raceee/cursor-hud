"use strict";

(function (root) {
  const LANG_FROM_EXT = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "tsx",
    py: "python",
    rs: "rust",
    go: "go",
    json: "json",
    css: "css",
    scss: "css",
    html: "html",
    htm: "html",
    xml: "html",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    lua: "lua",
    sql: "sql",
    yml: "yaml",
    yaml: "yaml",
    md: "markdown",
    swift: "swift",
    java: "java",
    rb: "ruby",
    php: "php",
    c: "c",
    h: "c",
    cpp: "cpp",
    toml: "toml",
  };

  const KEYWORDS = {
    javascript: "async await break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null return static super switch this throw true try typeof var void while with yield of from as",
    typescript: "async await break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null return static super switch this throw true try typeof var void while yield of from as type interface enum implements private public protected readonly abstract namespace declare satisfies",
    python: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield",
    rust: "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while",
    go: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil",
    lua: "and break do else elseif end false for function goto if in local nil not or repeat return then true until while",
    sql: "select from where join inner left right on group by order insert into values update set delete create table and or not null as limit offset",
    bash: "if then else elif fi for in do done while until case esac function return exit true false",
    c: "break case char const continue default do double else enum extern float for goto if int long return short signed sizeof static struct switch typedef union unsigned void while",
  };
  KEYWORDS.tsx = KEYWORDS.typescript;
  KEYWORDS.cpp = KEYWORDS.c;
  KEYWORDS.java = "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long new package private protected public return short static super switch this throw throws try void while true false null";
  KEYWORDS.swift = "as associatedtype break case catch class continue default defer deinit do else enum extension fallthrough false fileprivate for func guard if import in init inout internal let nil open operator private protocol public repeat return self static struct subscript super switch throw true try var where while";
  KEYWORDS.ruby = "alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield";
  KEYWORDS.php = "and as break case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final for foreach function global if implements include include_once instanceof interface isset list namespace new or private protected public return static switch throw try unset use var while xor true false null";

  function keywordSet(lang) {
    const list = KEYWORDS[lang] || KEYWORDS.javascript;
    return new Set(list.split(/\s+/));
  }

  function langFromPath(file) {
    const base = String(file || "").split(/[\\/]/).pop() || "";
    const ext = base.includes(".") ? base.split(".").pop().toLowerCase() : "";
    return LANG_FROM_EXT[ext] || ext;
  }

  function parseFenceInfo(info) {
    const raw = String(info || "").trim();
    if (!raw) return { lang: "", label: "code" };
    const cite = raw.match(/^(\d+):(\d+):(.+)$/);
    if (cite) {
      const file = cite[3].trim();
      return { lang: langFromPath(file), label: file, range: `${cite[1]}:${cite[2]}` };
    }
    if (/[./\\]/.test(raw) && !/^[A-Za-z][\w+-]*$/.test(raw)) {
      return { lang: langFromPath(raw), label: raw };
    }
    const lang = raw.toLowerCase();
    return { lang: LANG_FROM_EXT[lang] || lang, label: raw };
  }

  function findClosingFence(text, from) {
    let idx = from;
    while (idx < text.length) {
      const at = text.indexOf("```", idx);
      if (at === -1) return -1;
      if (at === 0 || text[at - 1] === "\n") return at;
      idx = at + 3;
    }
    return -1;
  }

  function parseMarkdownBlocks(input) {
    const text = String(input || "");
    const blocks = [];
    let i = 0;
    while (i < text.length) {
      const fence = text.indexOf("```", i);
      if (fence === -1) {
        if (i < text.length) blocks.push({ type: "text", text: text.slice(i) });
        break;
      }
      if (fence > i) blocks.push({ type: "text", text: text.slice(i, fence) });
      const after = fence + 3;
      const nl = text.indexOf("\n", after);
      if (nl === -1) {
        blocks.push({
          type: "code",
          info: text.slice(after).trim(),
          code: "",
          closed: false,
        });
        break;
      }
      const info = text.slice(after, nl);
      const bodyStart = nl + 1;
      const close = findClosingFence(text, bodyStart);
      if (close === -1) {
        blocks.push({
          type: "code",
          info: info.trim(),
          code: text.slice(bodyStart),
          closed: false,
        });
        break;
      }
      let code = text.slice(bodyStart, close);
      if (code.endsWith("\n")) code = code.slice(0, -1);
      blocks.push({ type: "code", info: info.trim(), code, closed: true });
      i = close + 3;
      if (text[i] === "\n") i += 1;
    }
    return blocks;
  }

  function highlightCode(code, lang) {
    const source = String(code || "");
    const language = String(lang || "").toLowerCase();
    const tokens = [];
    let rest = source;
    const keys = keywordSet(language);
    const hashComments = language === "python" || language === "bash" || language === "yaml" || language === "toml" || language === "ruby";
    const html = language === "html" || language === "xml";

    function push(type, text) {
      if (!text) return;
      const last = tokens[tokens.length - 1];
      if (last && last.type === type) last.text += text;
      else tokens.push({ type, text });
    }

    while (rest.length) {
      let match = null;
      if (html) {
        match =
          rest.match(/^<!--[\s\S]*?-->/) ||
          rest.match(/^<\/?[A-Za-z][\w:-]*/) ||
          rest.match(/^"(?:\\.|[^"\\])*"/) ||
          rest.match(/^'(?:\\.|[^'\\])*'/);
        if (match) {
          const type = match[0].startsWith("<!--") ? "com" : match[0][0] === "<" ? "kw" : "str";
          push(type, match[0]);
          rest = rest.slice(match[0].length);
          continue;
        }
      } else if (hashComments && rest.startsWith("#")) {
        match = rest.match(/^#[^\n]*/);
        push("com", match[0]);
        rest = rest.slice(match[0].length);
        continue;
      } else {
        match = rest.match(/^\/\/[^\n]*/) || rest.match(/^\/\*[\s\S]*?\*\//);
        if (match) {
          push("com", match[0]);
          rest = rest.slice(match[0].length);
          continue;
        }
      }
      match =
        rest.match(/^"""[\s\S]*?"""/) ||
        rest.match(/^'''[\s\S]*?'''/) ||
        rest.match(/^"(?:\\.|[^"\\])*"/) ||
        rest.match(/^'(?:\\.|[^'\\])*'/) ||
        rest.match(/^`(?:\\.|[^`\\])*`/);
      if (match) {
        push("str", match[0]);
        rest = rest.slice(match[0].length);
        continue;
      }
      match = rest.match(/^(0x[\da-fA-F]+|\d+\.\d+|\d+)/);
      if (match) {
        push("num", match[0]);
        rest = rest.slice(match[0].length);
        continue;
      }
      match = rest.match(/^[A-Za-z_$][\w$]*/);
      if (match) {
        push(keys.has(match[0]) ? "kw" : "id", match[0]);
        rest = rest.slice(match[0].length);
        continue;
      }
      match = rest.match(/^\s+/) || rest.match(/^[^\sA-Za-z0-9_$#]+/);
      push("plain", match ? match[0] : rest[0]);
      rest = rest.slice(match ? match[0].length : 1);
    }
    return tokens;
  }

  function safeHref(href) {
    const raw = String(href || "").trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    return "";
  }

  function findClose(s, from, mark) {
    let idx = from;
    while (idx < s.length) {
      const at = s.indexOf(mark, idx);
      if (at === -1) return -1;
      if (at > from) return at;
      idx = at + mark.length;
    }
    return -1;
  }

  function matchLink(s, i) {
    if (s[i] !== "[") return null;
    const close = s.indexOf("]", i + 1);
    if (close === -1 || close === i + 1) return null;
    if (s[close + 1] !== "(") return null;
    const endParen = s.indexOf(")", close + 2);
    if (endParen === -1) return null;
    const href = safeHref(s.slice(close + 2, endParen));
    if (!href) return null;
    return { text: s.slice(i + 1, close), href, end: endParen + 1 };
  }

  function parseInline(input) {
    const s = String(input || "");
    const tokens = [];
    let i = 0;

    function pushText(text) {
      if (!text) return;
      const last = tokens[tokens.length - 1];
      if (last && last.type === "text") last.text += text;
      else tokens.push({ type: "text", text });
    }

    while (i < s.length) {
      if (s[i] === "`") {
        const close = s.indexOf("`", i + 1);
        if (close > i + 1) {
          tokens.push({ type: "code", text: s.slice(i + 1, close) });
          i = close + 1;
          continue;
        }
      }
      if (s.startsWith("![", i)) {
        const img = matchLink(s, i + 1);
        if (img) {
          pushText(img.text || "image");
          i = img.end;
          continue;
        }
      }
      if (s[i] === "[") {
        const link = matchLink(s, i);
        if (link) {
          tokens.push({ type: "link", href: link.href, children: parseInline(link.text) });
          i = link.end;
          continue;
        }
      }
      if (s.startsWith("~~", i)) {
        const close = findClose(s, i + 2, "~~");
        if (close !== -1) {
          tokens.push({ type: "del", children: parseInline(s.slice(i + 2, close)) });
          i = close + 2;
          continue;
        }
      }
      if (s.startsWith("***", i) || s.startsWith("___", i)) {
        const mark = s.slice(i, i + 3);
        const close = findClose(s, i + 3, mark);
        if (close !== -1) {
          tokens.push({
            type: "strong",
            children: [{ type: "em", children: parseInline(s.slice(i + 3, close)) }],
          });
          i = close + 3;
          continue;
        }
      }
      if (s.startsWith("**", i) || s.startsWith("__", i)) {
        const mark = s.slice(i, i + 2);
        const close = findClose(s, i + 2, mark);
        if (close !== -1) {
          tokens.push({ type: "strong", children: parseInline(s.slice(i + 2, close)) });
          i = close + 2;
          continue;
        }
      }
      if (s[i] === "*" || s[i] === "_") {
        const mark = s[i];
        const flanked = s[i + 1] && !/\s/.test(s[i + 1]);
        const wordy = mark === "_" && i > 0 && /[A-Za-z0-9]/.test(s[i - 1]);
        if (flanked && !wordy) {
          let close = -1;
          for (let j = i + 1; j < s.length; j += 1) {
            if (s[j] !== mark) continue;
            if (/\s/.test(s[j - 1])) continue;
            if (mark === "_" && /[A-Za-z0-9]/.test(s[j + 1] || "")) continue;
            if (s[j + 1] === mark) continue;
            close = j;
            break;
          }
          if (close > i + 1) {
            tokens.push({ type: "em", children: parseInline(s.slice(i + 1, close)) });
            i = close + 1;
            continue;
          }
        }
      }
      pushText(s[i]);
      i += 1;
    }
    return tokens;
  }

  function isHr(line) {
    return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line) && !/^\s*[-*+]\s+\S/.test(line);
  }

  function headingMatch(line) {
    return String(line || "").match(/^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/);
  }

  function listMarker(line) {
    const m = String(line || "").match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (!m) return null;
    return { indent: m[1].length, ordered: /^\d/.test(m[2]), text: m[3] };
  }

  function splitTableRow(line) {
    let t = String(line || "").trim();
    if (t.startsWith("|")) t = t.slice(1);
    if (t.endsWith("|")) t = t.slice(0, -1);
    return t.split("|").map((cell) => cell.trim());
  }

  function isTableSep(line) {
    const cells = splitTableRow(line);
    return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.replace(/\s/g, "")));
  }

  function parseList(lines, start) {
    const first = listMarker(lines[start]);
    const baseIndent = first.indent;
    const ordered = first.ordered;
    const items = [];
    let i = start;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) {
        const peek = listMarker(lines[i + 1] || "");
        if (peek && peek.indent >= baseIndent) {
          i += 1;
          continue;
        }
        break;
      }
      const marker = listMarker(line);
      if (marker && marker.indent < baseIndent) break;
      if (marker && marker.indent === baseIndent) {
        if (marker.ordered !== ordered) break;
        items.push({ text: marker.text, children: null });
        i += 1;
        continue;
      }
      if (marker && marker.indent > baseIndent && items.length) {
        const nested = parseList(lines, i);
        items[items.length - 1].children = nested.block;
        i = nested.next;
        continue;
      }
      if (!marker && items.length) {
        const indent = line.match(/^(\s*)/)[1].length;
        if (indent > baseIndent) {
          items[items.length - 1].text += `\n${line.trim()}`;
          i += 1;
          continue;
        }
      }
      break;
    }
    return { block: { type: "list", ordered, items }, next: i };
  }

  function parseProseBlocks(input) {
    const lines = String(input || "").split(/\n/);
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) {
        i += 1;
        continue;
      }
      if (isHr(line)) {
        blocks.push({ type: "hr" });
        i += 1;
        continue;
      }
      const heading = headingMatch(line);
      if (heading) {
        blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
        i += 1;
        continue;
      }
      if (/^\s{0,3}>/.test(line)) {
        const quoted = [];
        while (i < lines.length) {
          if (/^\s{0,3}>/.test(lines[i])) {
            quoted.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
            i += 1;
            continue;
          }
          if (/^\s*$/.test(lines[i]) && /^\s{0,3}>/.test(lines[i + 1] || "")) {
            quoted.push("");
            i += 1;
            continue;
          }
          break;
        }
        blocks.push({ type: "blockquote", children: parseProseBlocks(quoted.join("\n")) });
        continue;
      }
      if (line.includes("|") && isTableSep(lines[i + 1] || "")) {
        const headers = splitTableRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes("|") && !isHr(lines[i]) && !headingMatch(lines[i])) {
          rows.push(splitTableRow(lines[i]));
          i += 1;
        }
        blocks.push({ type: "table", headers, rows });
        continue;
      }
      if (listMarker(line)) {
        const list = parseList(lines, i);
        blocks.push(list.block);
        i = list.next;
        continue;
      }
      const para = [line];
      i += 1;
      while (i < lines.length) {
        const next = lines[i];
        if (/^\s*$/.test(next) || isHr(next) || headingMatch(next) || listMarker(next) || /^\s{0,3}>/.test(next)) {
          break;
        }
        if (next.includes("|") && isTableSep(lines[i + 1] || "")) break;
        para.push(next);
        i += 1;
      }
      blocks.push({ type: "paragraph", text: para.join("\n") });
    }
    return blocks;
  }

  function appendTextWithInline(parent, text) {
    renderInline(parent, parseInline(text));
  }

  function renderInline(parent, tokens) {
    for (const token of tokens) {
      if (token.type === "text") {
        const parts = String(token.text || "").split("\n");
        parts.forEach((part, idx) => {
          if (idx) parent.appendChild(document.createElement("br"));
          if (part) parent.appendChild(document.createTextNode(part));
        });
        continue;
      }
      if (token.type === "code") {
        const code = document.createElement("code");
        code.className = "md-inline-code";
        code.textContent = token.text;
        parent.appendChild(code);
        continue;
      }
      if (token.type === "link") {
        const a = document.createElement("a");
        a.className = "md-link";
        a.href = token.href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        renderInline(a, token.children || []);
        parent.appendChild(a);
        continue;
      }
      const tag = token.type === "strong" ? "strong" : token.type === "em" ? "em" : token.type === "del" ? "del" : "";
      if (tag) {
        const el = document.createElement(tag);
        renderInline(el, token.children || []);
        parent.appendChild(el);
      }
    }
  }

  function renderCodePreview(parent, block) {
    const meta = parseFenceInfo(block.info);
    const preview = document.createElement("div");
    preview.className = "code-preview";
    const bar = document.createElement("div");
    bar.className = "code-preview-bar";
    const label = document.createElement("span");
    label.className = "code-preview-label";
    label.textContent = meta.range ? `${meta.label}:${meta.range}` : meta.label;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "code-copy";
    copy.textContent = "Copy";
    copy.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(block.code).catch(() => {});
      }
    });
    bar.append(label, copy);
    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    const tokens = highlightCode(block.code, meta.lang);
    for (const token of tokens) {
      if (token.type === "plain" || token.type === "id") {
        codeEl.appendChild(document.createTextNode(token.text));
      } else {
        const span = document.createElement("span");
        span.className = `tok tok-${token.type}`;
        span.textContent = token.text;
        codeEl.appendChild(span);
      }
    }
    pre.appendChild(codeEl);
    preview.append(bar, pre);
    parent.appendChild(preview);
  }

  function taskItem(text) {
    const m = String(text || "").match(/^\[([ xX])\]\s+([\s\S]*)$/);
    if (!m) return null;
    return { checked: m[1] !== " ", text: m[2] };
  }

  function renderProse(parent, blocks) {
    for (const block of blocks) {
      if (block.type === "heading") {
        const heading = document.createElement(`h${Math.min(6, Math.max(1, block.level))}`);
        heading.className = "md-h";
        appendTextWithInline(heading, block.text);
        parent.appendChild(heading);
        continue;
      }
      if (block.type === "hr") {
        parent.appendChild(document.createElement("hr"));
        continue;
      }
      if (block.type === "blockquote") {
        const quote = document.createElement("blockquote");
        quote.className = "md-quote";
        renderProse(quote, block.children || []);
        parent.appendChild(quote);
        continue;
      }
      if (block.type === "list") {
        const list = document.createElement(block.ordered ? "ol" : "ul");
        list.className = "md-list";
        for (const item of block.items || []) {
          const li = document.createElement("li");
          const task = taskItem(item.text);
          if (task) {
            li.className = "md-task";
            const mark = document.createElement("span");
            mark.className = `md-check${task.checked ? " is-done" : ""}`;
            mark.textContent = task.checked ? "☑" : "☐";
            li.appendChild(mark);
            appendTextWithInline(li, task.text);
          } else {
            appendTextWithInline(li, item.text);
          }
          if (item.children) renderProse(li, [item.children]);
          list.appendChild(li);
        }
        parent.appendChild(list);
        continue;
      }
      if (block.type === "table") {
        const table = document.createElement("table");
        table.className = "md-table";
        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        for (const cell of block.headers || []) {
          const th = document.createElement("th");
          appendTextWithInline(th, cell);
          headRow.appendChild(th);
        }
        thead.appendChild(headRow);
        table.appendChild(thead);
        const tbody = document.createElement("tbody");
        for (const row of block.rows || []) {
          const tr = document.createElement("tr");
          for (const cell of row) {
            const td = document.createElement("td");
            appendTextWithInline(td, cell);
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        parent.appendChild(table);
        continue;
      }
      const p = document.createElement("p");
      p.className = "md-p";
      appendTextWithInline(p, block.text || "");
      parent.appendChild(p);
    }
  }

  function renderMarkdown(parent, text) {
    parent.textContent = "";
    const blocks = parseMarkdownBlocks(text);
    for (const block of blocks) {
      if (block.type === "code") {
        renderCodePreview(parent, block);
        continue;
      }
      const body = document.createElement("div");
      body.className = "md-prose";
      renderProse(body, parseProseBlocks(block.text));
      if (body.childNodes.length) parent.appendChild(body);
    }
  }

  const api = {
    parseMarkdownBlocks,
    parseProseBlocks,
    parseInline,
    parseFenceInfo,
    langFromPath,
    highlightCode,
    renderMarkdown,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HudMarkdown = api;
})(typeof window !== "undefined" ? window : globalThis);
