"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { attachHistory, priorTurns, slimMessages } = require("../lib/context");
const { normalizeTabs } = require("../lib/tabs");

describe("conversation context", () => {
  it("keeps the prompt unchanged when there is no prior chat", () => {
    assert.equal(attachHistory([], "Make a plan"), "Make a plan");
    assert.equal(attachHistory([{ role: "user", text: "Make a plan" }], "Make a plan"), "Make a plan");
  });

  it("bridges earlier turns when a new agent must be created", () => {
    const prompt = attachHistory(
      [
        { role: "user", text: "We are building TriEx for Pelusium." },
        { role: "assistant", text: "I will examine the existing codebase first." },
      ],
      "Can we make a plan to build this?"
    );
    assert.match(prompt, /continuation/);
    assert.match(prompt, /TriEx/);
    assert.match(prompt, /Can we make a plan to build this\?/);
    assert.equal(priorTurns([{ role: "user", text: "hi" }], "hi").length, 0);
  });

  it("persists agent id and messages on a tab", () => {
    const tabs = normalizeTabs([
      {
        id: "tab-1",
        workspace: "/app",
        title: "app",
        agentId: "bc-local-1",
        messages: [{ role: "user", text: "hello" }],
      },
    ]);
    assert.equal(tabs[0].agentId, "bc-local-1");
    assert.equal(tabs[0].messages[0].text, "hello");
  });

  it("slims empty or junk messages out", () => {
    assert.deepEqual(slimMessages([{ role: "tool", text: "x" }, { role: "user", text: "  " }]), []);
  });
});
