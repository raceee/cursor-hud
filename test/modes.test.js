"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { listModes, normalizeMode, getMode, resolveModeOptions } = require("../lib/modes");
const { normalizeConfig } = require("../lib/config");

describe("conversation modes", () => {
  it("lists the Cursor-style modes", () => {
    const modes = listModes();
    assert.deepEqual(
      modes.map((mode) => mode.id),
      ["agent", "plan", "ask", "debug"]
    );
  });

  it("normalizes unknown modes to agent", () => {
    assert.equal(normalizeMode("plan"), "plan");
    assert.equal(normalizeMode("ASK"), "ask");
    assert.equal(normalizeMode("nope"), "agent");
  });

  it("maps ask to read-only tool restrictions", () => {
    const options = resolveModeOptions("ask");
    assert.equal(options.sdkMode, "agent");
    assert.ok(options.disallowedTools.includes("shell"));
    assert.ok(options.disallowedTools.includes("edit"));
  });

  it("sends only SDK-supported modes", () => {
    assert.equal(resolveModeOptions("plan").sdkMode, "plan");
    assert.equal(resolveModeOptions("debug").sdkMode, "agent");
    assert.equal(resolveModeOptions("agent").sdkMode, "agent");
  });

  it("persists mode in config defaults", () => {
    const cfg = normalizeConfig({ mode: "debug" });
    assert.equal(cfg.mode, "debug");
    assert.equal(getMode(cfg.mode).label, "Debug");
    assert.equal(normalizeConfig({ mode: "bogus" }).mode, "agent");
  });
});
