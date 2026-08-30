"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SECRET = /api[_-]?key|authorization|password|secret|cookie|token/i;
const MAX_STRING = 4000;
const MAX_JSONL_BYTES = 1_500_000;

function truncate(text, max) {
  const value = String(text == null ? "" : text);
  const limit = max || MAX_STRING;
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
}

function redact(value, depth) {
  if (depth > 6) return "[deep]";
  if (value == null) return value;
  if (typeof value === "string") return truncate(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => redact(item, (depth || 0) + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET.test(key)) {
      out[key] = item ? "[redacted]" : "";
      continue;
    }
    out[key] = redact(item, (depth || 0) + 1);
  }
  return out;
}

function slimMessage(msg) {
  if (!msg || typeof msg !== "object") return null;
  return {
    role: msg.role || "",
    pending: Boolean(msg.pending),
    text: truncate(msg.text || "", 2000),
  };
}

function slimTranscript(tab, extras) {
  const transcript = (tab && tab.transcript) || {};
  const messages = Array.isArray(transcript.messages) ? transcript.messages : [];
  return {
    tabId: tab && tab.id,
    title: tab && tab.title,
    workspace: tab && tab.workspace,
    status: transcript.status || "idle",
    thinking: truncate(transcript.thinking || "", 400),
    error: transcript.error || null,
    tools: (transcript.tools || []).slice(-12).map((tool) => ({
      name: tool.name,
      status: tool.status,
      detail: truncate(tool.detail || "", 160),
    })),
    messages: messages.slice(-12).map(slimMessage).filter(Boolean),
    ...(extras && typeof extras === "object" ? extras : {}),
  };
}

function defaultDir() {
  if (process.env.CURSOR_HUD_DEBUG_DIR) return process.env.CURSOR_HUD_DEBUG_DIR;
  return path.join(process.cwd(), "debug");
}

function createTracer(initial) {
  const state = {
    enabled: Boolean(initial && initial.enabled),
    dir: (initial && initial.dir) || defaultDir(),
  };

  function configure(next) {
    if (!next || typeof next !== "object") return state;
    if (next.enabled != null) state.enabled = Boolean(next.enabled);
    if (typeof next.dir === "string" && next.dir.trim()) state.dir = next.dir.trim();
    return state;
  }

  function paths() {
    fs.mkdirSync(state.dir, { recursive: true });
    return {
      jsonl: path.join(state.dir, "hud-trace.jsonl"),
      latest: path.join(state.dir, "latest.json"),
    };
  }

  function rotate(file) {
    try {
      const size = fs.statSync(file).size;
      if (size < MAX_JSONL_BYTES) return;
      fs.renameSync(file, `${file}.prev`);
    } catch {
      /* first write or missing */
    }
  }

  function append(event) {
    if (!state.enabled) return null;
    const line = {
      t: new Date().toISOString(),
      ...redact(event && typeof event === "object" ? event : { event }),
    };
    const { jsonl } = paths();
    rotate(jsonl);
    fs.appendFileSync(jsonl, `${JSON.stringify(line)}\n`);
    return line;
  }

  function snapshot(view) {
    if (!state.enabled) return null;
    const { latest } = paths();
    const body = {
      t: new Date().toISOString(),
      ...redact(view && typeof view === "object" ? view : {}),
    };
    fs.writeFileSync(latest, `${JSON.stringify(body, null, 2)}\n`);
    return body;
  }

  return { configure, append, snapshot, slimTranscript, redact };
}

module.exports = {
  createTracer,
  redact,
  slimTranscript,
  slimMessage,
  truncate,
  defaultDir,
};
