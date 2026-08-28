"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createNdjsonParser, encodeLine, extractAssistantText } = require("../lib/protocol");
const { normalizeConfig, validateWorkspace } = require("../lib/config");

describe("protocol", () => {
  it("parses concatenated ndjson chunks", () => {
    const messages = [];
    const push = createNdjsonParser((msg) => messages.push(msg));
    push('{"a":1}\n{"b":');
    push('2}\n');
    assert.deepEqual(messages, [{ a: 1 }, { b: 2 }]);
  });

  it("extracts assistant text blocks", () => {
    const text = extractAssistantText({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Hello " },
          { type: "tool_use", name: "read" },
          { type: "text", text: "world" },
        ],
      },
    });
    assert.equal(text, "Hello world");
    assert.equal(encodeLine({ ok: true }), '{"ok":true}\n');
  });
});

describe("config", () => {
  it("fills defaults and rejects an empty workspace", () => {
    const cfg = normalizeConfig({ workspace: "  /wow  ", attachScreen: 1 });
    assert.equal(cfg.workspace, "/wow");
    assert.equal(cfg.model, "composer-2.5");
    assert.equal(cfg.attachScreen, true);
    assert.equal(validateWorkspace(""), "Pick the project folder Cursor should work in.");
    assert.equal(validateWorkspace(cfg.workspace), null);
  });
});
