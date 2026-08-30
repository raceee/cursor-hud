"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  friendlyToolName,
  pickDetail,
  formatToolLine,
  lastThinkingLine,
  toHudDelta,
  extractPlanMarkdown,
  looksLikePlan,
  hasReadyPlan,
} = require("../lib/activity");
const { createTranscript, applyHudEvent } = require("../lib/transcript");

describe("activity labels", () => {
  it("maps tool names to glanceable verbs", () => {
    assert.equal(friendlyToolName("grep"), "Searching");
    assert.equal(friendlyToolName("read_file"), "Reading");
    assert.equal(friendlyToolName("shell"), "Running");
    assert.equal(formatToolLine({ name: "read", detail: "renderer/app.js", status: "running" }), "Reading renderer/app.js");
    assert.equal(formatToolLine({ name: "grep", status: "running" }), "Searching…");
  });

  it("picks a short path or query from tool args", () => {
    assert.equal(pickDetail({ path: "lib/modes.js", query: "mode" }), "lib/modes.js");
    assert.equal(pickDetail({ query: "hud overlay" }), "hud overlay");
  });

  it("turns CreatePlan args into readable markdown", () => {
    const markdown = extractPlanMarkdown("createPlan", {
      name: "HUD overlay",
      plan: "1. Show activity\n2. Keep ghost mode",
      todos: [{ content: "Show activity", status: "pending" }],
    });
    assert.match(markdown, /## HUD overlay/);
    assert.match(markdown, /Show activity/);
    assert.match(markdown, /\[ \]/);
    assert.equal(formatToolLine({ name: "createPlan", status: "running" }), "Creating a plan…");
  });

  it("shows a ready plan after CreatePlan finishes", () => {
    assert.equal(looksLikePlan("# TriEx Gas-Station Integration Plan\n\n## Current state\n"), true);
    assert.equal(looksLikePlan("I'll search the repo."), false);
    let state = createTranscript();
    state = applyHudEvent(state, { kind: "user", text: "Can you make a plan for this?" });
    state = applyHudEvent(state, { kind: "assistant-start" });
    state = applyHudEvent(state, {
      kind: "tool",
      name: "createPlan",
      status: "completed",
      detail: "TriEx Gas-Station Integration Plan",
    });
    state = applyHudEvent(state, {
      kind: "assistant-delta",
      text: "# TriEx Gas-Station Integration Plan\n\nBuild the jobs filter.",
    });
    state = applyHudEvent(state, { kind: "done", status: "finished" });
    assert.equal(hasReadyPlan(state, "plan"), true);
    state.status = "running";
    assert.equal(hasReadyPlan(state, "plan"), false);
  });

  it("turns SDK deltas into HUD events", () => {
    assert.equal(toHudDelta({ type: "text-delta", text: "Hi" }).kind, "assistant-delta");
    assert.equal(toHudDelta({ type: "thinking-delta", text: "Let me look" }).kind, "thinking-delta");
    const tool = toHudDelta({
      type: "tool-call-started",
      callId: "1",
      toolCall: { name: "read", args: { path: "README.md" } },
    });
    assert.equal(tool.kind, "tool");
    assert.equal(tool.status, "running");
    assert.equal(tool.detail, "README.md");
  });
});

describe("live activity transcript", () => {
  it("keeps thinking and tool rows while a reply is still pending", () => {
    let state = createTranscript();
    state = applyHudEvent(state, { kind: "user", text: "fix it" });
    state = applyHudEvent(state, { kind: "assistant-start" });
    state = applyHudEvent(state, { kind: "thinking-delta", text: "I should search" });
    state = applyHudEvent(state, {
      kind: "tool",
      call_id: "1",
      name: "grep",
      status: "running",
      detail: "activity",
    });
    assert.equal(state.thinking, "I should search");
    assert.equal(state.tools[0].detail, "activity");
    assert.equal(lastThinkingLine(state.thinking), "I should search");
    state = applyHudEvent(state, { kind: "done", result: "Done.", status: "finished" });
    assert.equal(state.thinking, "");
    assert.equal(state.tools[0].status, "completed");
  });
});
