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

  function appendTextWithInline(parent, text) {
    const parts = String(text || "").split(/(`[^`]+`|\*\*[^*\n]+\*\*)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
        const code = document.createElement("code");
        code.className = "md-inline-code";
        code.textContent = part.slice(1, -1);
        parent.appendChild(code);
      } else if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        parent.appendChild(strong);
      } else {
        parent.appendChild(document.createTextNode(part));
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

  function renderMarkdown(parent, text) {
    parent.textContent = "";
    const blocks = parseMarkdownBlocks(text);
    for (const block of blocks) {
      if (block.type === "code") {
        renderCodePreview(parent, block);
        continue;
      }
      const body = document.createElement("div");
      body.className = "md-text";
      appendTextWithInline(body, block.text);
      parent.appendChild(body);
    }
  }

  const api = {
    parseMarkdownBlocks,
    parseFenceInfo,
    langFromPath,
    highlightCode,
    renderMarkdown,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HudMarkdown = api;
})(typeof window !== "undefined" ? window : globalThis);
