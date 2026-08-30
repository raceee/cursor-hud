"use strict";

(function (root) {
  const TOOL_LABELS = {
    grep: "Searching",
    ripgrep: "Searching",
    codebase_search: "Searching",
    semsearch: "Searching",
    search: "Searching",
    web_search: "Searching the web",
    read: "Reading",
    read_file: "Reading",
    readfile: "Reading",
    edit: "Editing",
    write: "Writing",
    apply_patch: "Editing",
    applyagentdiff: "Applying edits",
    delete: "Deleting",
    shell: "Running",
    bash: "Running",
    glob: "Finding files",
    glob_file_search: "Finding files",
    ls: "Listing",
    list: "Listing",
    task: "Starting a task",
    generateimage: "Generating an image",
    await: "Waiting",
    createplan: "Creating a plan",
    create_plan: "Creating a plan",
  };

  function shorten(value, max) {
    const limit = max || 42;
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(1, limit - 1))}…`;
  }

  function friendlyToolName(name) {
    const raw = String(name || "").trim();
    if (!raw || raw === "tool") return "Working";
    const key = raw.toLowerCase().replace(/[\s-]+/g, "_");
    if (TOOL_LABELS[key]) return TOOL_LABELS[key];
    const compact = key.replace(/_/g, "");
    if (TOOL_LABELS[compact]) return TOOL_LABELS[compact];
    return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function pickDetail(args) {
    if (args == null) return "";
    if (typeof args === "string") return args;
    if (typeof args !== "object") return "";
    const keys = [
      "path",
      "file",
      "file_path",
      "target_file",
      "relativeWorkspacePath",
      "query",
      "pattern",
      "glob",
      "command",
      "cmd",
      "url",
      "search",
      "title",
    ];
    for (const key of keys) {
      if (args[key] != null && String(args[key]).trim()) return String(args[key]);
    }
    if (args.plan) {
      const first = String(args.plan)
        .split("\n")
        .map((line) => line.replace(/^#+\s*/, "").trim())
        .find(Boolean);
      return first || "plan";
    }
    return "";
  }

  function isCreatePlan(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[\s_-]+/g, "") === "createplan";
  }

  function looksLikePlan(text) {
    const raw = String(text || "");
    if (raw.length < 40) return false;
    return /^#{1,3}\s+\S/m.test(raw) || /^##\s+todos\b/im.test(raw);
  }

  function lastAssistant(state) {
    const messages = (state && state.messages) || [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i] && messages[i].role === "assistant") return messages[i];
    }
    return null;
  }

  function hasReadyPlan(state, mode) {
    if (!state) return false;
    const status = String(state.status || "");
    if (status === "running" || status === "thinking") return false;
    const assistant = lastAssistant(state);
    if (!assistant || assistant.pending || !String(assistant.text || "").trim()) return false;
    const created = (state.tools || []).some(
      (tool) => isCreatePlan(tool.name) && normalizeToolStatus(tool.status) !== "running"
    );
    return created || ((mode === "plan" || created) && looksLikePlan(assistant.text));
  }

  function extractPlanMarkdown(name, args) {
    if (!isCreatePlan(name) || !args || typeof args !== "object") return "";
    const body = String(args.plan || "").trim();
    if (!body) return "";
    const title = String(args.name || args.title || "").trim();
    const overview = String(args.overview || "").trim();
    const parts = [];
    if (title) parts.push(`## ${title}`);
    if (overview) parts.push(overview);
    parts.push(body);
    if (Array.isArray(args.todos) && args.todos.length) {
      parts.push(
        ["### Todos"]
          .concat(
            args.todos.map((todo) => {
              const done = todo && (todo.status === "completed" || todo.status === "done");
              return `- [${done ? "x" : " "}] ${todo.content || todo.text || "Todo"}`;
            })
          )
          .join("\n")
      );
    }
    return parts.join("\n\n");
  }

  function toolCallFrom(update) {
    if (!update || typeof update !== "object") return {};
    return update.toolCall || update.tool_call || update.call || {};
  }

  function toolNameFrom(update) {
    const call = toolCallFrom(update);
    return (
      call.name ||
      call.toolName ||
      call.tool ||
      call.type ||
      (call.function && call.function.name) ||
      update.name ||
      "tool"
    );
  }

  function toolArgsFrom(update) {
    const call = toolCallFrom(update);
    return call.args || call.input || (call.function && call.function.arguments) || update.args || update.input || null;
  }

  function toolIdFrom(update) {
    return update.callId || update.call_id || toolCallFrom(update).id || toolNameFrom(update);
  }

  function normalizeToolStatus(status) {
    const value = String(status || "").toLowerCase();
    if (value === "completed" || value === "success" || value === "done" || value === "finished") {
      return "completed";
    }
    if (value === "error" || value === "failed" || value === "cancelled") return "error";
    return "running";
  }

  function formatToolLine(tool) {
    const label = friendlyToolName(tool && tool.name);
    const detail = shorten(tool && tool.detail);
    const running = normalizeToolStatus(tool && tool.status) === "running";
    if (!detail) return running ? `${label}…` : label;
    return `${label} ${detail}`;
  }

  function lastThinkingLine(text) {
    const lines = String(text || "")
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.length ? shorten(lines[lines.length - 1], 72) : "";
  }

  function fromTextDelta(update) {
    if (!update || update.type !== "text-delta" || update.text == null || update.text === "") return null;
    let text = String(update.text);
    if (text.length > 1 && text.endsWith("\n") && !text.endsWith("\n\n")) {
      text = text.slice(0, -1);
    }
    return { kind: "assistant-delta", text };
  }

  function fromToolUpdate(update, status) {
    const name = toolNameFrom(update);
    return {
      kind: "tool",
      call_id: toolIdFrom(update),
      name,
      status,
      detail: pickDetail(toolArgsFrom(update)),
    };
  }

  function planMarkdownFromDelta(update) {
    return extractPlanMarkdown(toolNameFrom(update), toolArgsFrom(update));
  }

  function toHudDelta(update) {
    if (!update || typeof update !== "object") return null;
    switch (update.type) {
      case "text-delta":
        return fromTextDelta(update);
      case "thinking-delta":
        if (update.text == null || update.text === "") return null;
        return { kind: "thinking-delta", text: String(update.text) };
      case "tool-call-started":
      case "partial-tool-call":
        return fromToolUpdate(update, "running");
      case "tool-call-completed":
        return fromToolUpdate(update, "completed");
      default:
        return null;
    }
  }

  const api = {
    friendlyToolName,
    pickDetail,
    formatToolLine,
    lastThinkingLine,
    normalizeToolStatus,
    toHudDelta,
    extractPlanMarkdown,
    isCreatePlan,
    looksLikePlan,
    hasReadyPlan,
    planMarkdownFromDelta,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HudActivity = api;
})(typeof window !== "undefined" ? window : globalThis);
