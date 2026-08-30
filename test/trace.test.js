"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createTracer, redact, slimTranscript } = require("../lib/trace");
const { normalizeConfig } = require("../lib/config");

describe("debug traces", () => {
  it("redacts secrets and keeps tool names", () => {
    const clean = redact({
      name: "read",
      apiKey: "cursor_secret",
      detail: "renderer/app.js",
    });
    assert.equal(clean.apiKey, "[redacted]");
    assert.equal(clean.name, "read");
    assert.equal(clean.detail, "renderer/app.js");
  });

  it("slims a transcript for latest.json", () => {
    const view = slimTranscript({
      id: "tab-1",
      title: "hud",
      workspace: "/app",
      transcript: {
        status: "running",
        thinking: "look around",
        tools: [{ name: "grep", status: "running", detail: "plan" }],
        messages: [
          { role: "user", text: "Can we make a plan to build this?" },
          { role: "assistant", text: "I will examine the repo.", pending: true },
        ],
      },
    });
    assert.equal(view.tabId, "tab-1");
    assert.equal(view.messages[0].role, "user");
    assert.match(view.messages[0].text, /plan/);
  });

  it("writes jsonl and latest only when enabled", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hud-trace-"));
    const tracer = createTracer({ enabled: false, dir });
    assert.equal(tracer.append({ kind: "user", text: "hi" }), null);
    tracer.configure({ enabled: true });
    tracer.append({ kind: "tool", name: "read" });
    tracer.snapshot({ mode: "plan", workspace: "/app" });
    const jsonl = fs.readFileSync(path.join(dir, "hud-trace.jsonl"), "utf8");
    const latest = JSON.parse(fs.readFileSync(path.join(dir, "latest.json"), "utf8"));
    assert.match(jsonl, /"kind":"tool"/);
    assert.equal(latest.mode, "plan");
  });

  it("persists the debug flag", () => {
    assert.equal(normalizeConfig({}).debug, true);
    assert.equal(normalizeConfig({ debug: false }).debug, false);
  });
});
