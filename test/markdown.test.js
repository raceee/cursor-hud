"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseMarkdownBlocks,
  parseProseBlocks,
  parseInline,
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

describe("markdown prose", () => {
  it("turns headings, lists, and quotes into blocks", () => {
    const blocks = parseProseBlocks("## Plan\n\n- one\n- two\n\n> note");
    assert.equal(blocks.length, 3);
    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[0].level, 2);
    assert.equal(blocks[0].text, "Plan");
    assert.equal(blocks[1].type, "list");
    assert.equal(blocks[1].ordered, false);
    assert.equal(blocks[1].items[0].text, "one");
    assert.equal(blocks[1].items[1].text, "two");
    assert.equal(blocks[2].type, "blockquote");
    assert.equal(blocks[2].children[0].type, "paragraph");
    assert.equal(blocks[2].children[0].text, "note");
  });

  it("parses numbered lists and nested bullets", () => {
    const blocks = parseProseBlocks("1. first\n2. second\n   - nested");
    assert.equal(blocks[0].type, "list");
    assert.equal(blocks[0].ordered, true);
    assert.equal(blocks[0].items[1].text, "second");
    assert.equal(blocks[0].items[1].children.type, "list");
    assert.equal(blocks[0].items[1].children.items[0].text, "nested");
  });

  it("parses GFM tables", () => {
    const blocks = parseProseBlocks("| a | b |\n| --- | --- |\n| 1 | 2 |");
    assert.equal(blocks[0].type, "table");
    assert.deepEqual(blocks[0].headers, ["a", "b"]);
    assert.deepEqual(blocks[0].rows, [["1", "2"]]);
  });

  it("compiles inline bold, italic, code, strike, and links", () => {
    const tokens = parseInline("Use **bold** and *italic* and `x` and ~~old~~ and [docs](https://example.com)");
    const types = tokens.map((token) => token.type);
    assert.deepEqual(types, ["text", "strong", "text", "em", "text", "code", "text", "del", "text", "link"]);
    assert.equal(tokens[1].children[0].text, "bold");
    assert.equal(tokens[3].children[0].text, "italic");
    assert.equal(tokens[5].text, "x");
    assert.equal(tokens[7].children[0].text, "old");
    assert.equal(tokens[9].href, "https://example.com");
    assert.equal(tokens[9].children[0].text, "docs");
  });

  it("does not italicize snake_case identifiers", () => {
    const tokens = parseInline("use hud_window_bounds here");
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].type, "text");
  });

  it("ignores javascript links", () => {
    const tokens = parseInline("[x](javascript:alert(1))");
    assert.equal(tokens.some((token) => token.type === "link"), false);
  });
});
