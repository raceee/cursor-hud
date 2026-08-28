"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseMarkdownBlocks,
  parseFenceInfo,
  highlightCode,
} = require("../lib/markdown");
const { formatAssistantText } = require("../lib/transcript");

describe("markdown code previews", () => {
  it("splits fenced code from surrounding prose", () => {
    const blocks = parseMarkdownBlocks("Use this:\n```js\nconst n = 1;\n```\nDone.");
    assert.equal(blocks.length, 3);
    assert.equal(blocks[0].type, "text");
    assert.equal(blocks[1].type, "code");
    assert.equal(blocks[1].info, "js");
    assert.equal(blocks[1].code, "const n = 1;");
    assert.equal(blocks[1].closed, true);
    assert.match(blocks[2].text, /Done/);
  });

  it("keeps an unclosed fence as a live code preview while streaming", () => {
    const blocks = parseMarkdownBlocks("```python\nprint(");
    assert.equal(blocks[0].type, "code");
    assert.equal(blocks[0].closed, false);
    assert.equal(blocks[0].code, 'print(');
  });

  it("reads Cursor-style file citations on the fence", () => {
    const meta = parseFenceInfo("12:15:app/components/Todo.tsx");
    assert.equal(meta.lang, "tsx");
    assert.equal(meta.label, "app/components/Todo.tsx");
    assert.equal(meta.range, "12:15");
  });

  it("colors keywords, strings, and comments", () => {
    const tokens = highlightCode('const name = "hud"; // hi', "javascript");
    const types = tokens.map((token) => token.type);
    assert.ok(types.includes("kw"));
    assert.ok(types.includes("str"));
    assert.ok(types.includes("com"));
    assert.equal(tokens.find((token) => token.type === "kw").text, "const");
  });

  it("does not crush fenced code into a single token line", () => {
    const source = "```js\nconst\na\n=\n1\n```";
    assert.equal(formatAssistantText(source), source);
  });
});
