"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createTranscript, applyHudEvent } = require("../lib/transcript");

describe("transcript", () => {
  it("streams a user prompt and assistant deltas into one pending reply", () => {
    let state = createTranscript();
    state = applyHudEvent(state, { kind: "user", text: "What quest is this?" });
    state = applyHudEvent(state, { kind: "assistant-start" });
    state = applyHudEvent(state, { kind: "assistant-delta", text: "That's " });
    state = applyHudEvent(state, { kind: "assistant-delta", text: "The Stockade." });
    state = applyHudEvent(state, { kind: "done", result: "That's The Stockade.", status: "finished" });

    assert.equal(state.messages.length, 2);
    assert.equal(state.messages[0].role, "user");
    assert.equal(state.messages[1].text, "That's The Stockade.");
    assert.equal(state.messages[1].pending, false);
    assert.equal(state.status, "idle");
  });

  it("records tool activity and clears running tools on done", () => {
    let state = createTranscript();
    state = applyHudEvent(state, { kind: "user", text: "fix it" });
    state = applyHudEvent(state, {
      kind: "tool",
      call_id: "1",
      name: "read",
      status: "running",
    });
    state = applyHudEvent(state, {
      kind: "tool",
      call_id: "1",
      name: "read",
      status: "completed",
    });
    state = applyHudEvent(state, { kind: "done", status: "finished" });
    assert.equal(state.tools[0].status, "completed");
  });

  it("surfaces host errors without dropping the user line", () => {
    let state = createTranscript();
    state = applyHudEvent(state, { kind: "user", text: "hi" });
    state = applyHudEvent(state, { kind: "assistant-start" });
    state = applyHudEvent(state, { kind: "error", message: "not signed in" });
    assert.equal(state.messages[0].text, "hi");
    assert.equal(state.status, "error");
    assert.equal(state.error, "not signed in");
    assert.equal(state.messages[1].pending, false);
  });

  it("keeps streamed tokens in one paragraph instead of one message per token", () => {
    let state = createTranscript();
    state = applyHudEvent(state, { kind: "user", text: "hi" });
    state = applyHudEvent(state, { kind: "assistant-start" });
    state = applyHudEvent(state, { kind: "assistant", text: "The" });
    state = applyHudEvent(state, { kind: "assistant", text: " HUD" });
    state = applyHudEvent(state, { kind: "assistant", text: " stays" });
    state = applyHudEvent(state, { kind: "done", result: "The HUD stays put.", status: "finished" });
    assert.equal(state.messages.filter((msg) => msg.role === "assistant").length, 1);
    assert.equal(state.messages[1].text, "The HUD stays put.");
  });

  it("prefers a cumulative snapshot over appending it again", () => {
    const { mergeAssistantText } = require("../lib/transcript");
    assert.equal(mergeAssistantText("The HUD", "The HUD stays put."), "The HUD stays put.");
    assert.equal(mergeAssistantText("The HUD stays put.", "The HUD"), "The HUD stays put.");
    assert.equal(mergeAssistantText("The HUD ", "stays put."), "The HUD stays put.");
  });

  it("joins token-per-line dumps into a paragraph", () => {
    const { formatAssistantText } = require("../lib/transcript");
    const dumped = ["The", "HUD", "stays", "put", "over", "the", "game."].join("\n");
    assert.equal(formatAssistantText(dumped), "The HUD stays put over the game.");
    assert.equal(formatAssistantText("Line one.\n\nLine two."), "Line one.\n\nLine two.");
  });
});
