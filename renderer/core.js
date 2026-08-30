"use strict";

(function (root) {
  function createTranscript() {
    return {
      messages: [],
      status: "idle",
      tools: [],
      error: null,
    };
  }

  function lastOfRole(messages, role) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === role) return messages[i];
    }
    return null;
  }

  function mergeAssistantText(current, incoming) {
    const existing = String(current || "");
    const next = String(incoming || "");
    if (!next) return existing;
    if (!existing) return next;
    if (next === existing) return existing;
    if (next.startsWith(existing)) return next;
    if (existing.startsWith(next)) return existing;
    return existing + next;
  }

  function looksLikeMarkdown(text) {
    return /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|\|)/m.test(String(text || "").trim());
  }

  function formatAssistantText(text) {
    const raw = String(text || "");
    if (raw.includes("```") || looksLikeMarkdown(raw)) return raw;
    const lines = raw.split(/\r?\n/);
    const nonempty = lines.filter((line) => line.length > 0);
    if (nonempty.length < 5) return raw;
    const tokenLike = nonempty.every(
      (line) => line.trim().split(/\s+/).length <= 3 && line.length <= 48
    );
    if (!tokenLike) return raw;
    return nonempty.reduce((acc, line) => {
      if (!acc) return line;
      if (acc.endsWith(" ") || /^\s/.test(line)) return acc + line;
      return `${acc} ${line.trim()}`;
    }, "");
  }

  function upsertAssistant(next, text, finalize) {
    let assistant = lastOfRole(next.messages, "assistant");
    if (!assistant || !assistant.pending) {
      assistant = {
        id: `assistant-${next.messages.length + 1}`,
        role: "assistant",
        text: "",
        pending: true,
      };
      next.messages.push(assistant);
    }
    assistant.text = mergeAssistantText(assistant.text, text);
    assistant.pending = !finalize;
    return assistant;
  }

  function applyHudEvent(state, event) {
    if (!event || typeof event !== "object") return state;
    const next = {
      ...state,
      messages: state.messages.slice(),
      tools: state.tools.slice(),
    };

    switch (event.kind) {
      case "user": {
        next.messages.push({
          id: event.id || `user-${next.messages.length + 1}`,
          role: "user",
          text: String(event.text || ""),
        });
        next.status = "running";
        next.error = null;
        next.tools = [];
        break;
      }
      case "assistant-start": {
        const existing = lastOfRole(next.messages, "assistant");
        if (!existing || !existing.pending) {
          next.messages.push({
            id: event.id || `assistant-${next.messages.length + 1}`,
            role: "assistant",
            text: "",
            pending: true,
          });
        }
        next.status = "running";
        break;
      }
      case "assistant-delta": {
        upsertAssistant(next, event.text, false);
        next.status = "running";
        break;
      }
      case "assistant": {
        upsertAssistant(next, event.text, false);
        next.status = "running";
        break;
      }
      case "tool": {
        const callId = event.call_id || event.name || `tool-${next.tools.length + 1}`;
        const existing = next.tools.find((tool) => tool.call_id === callId);
        const entry = {
          call_id: callId,
          name: event.name || "tool",
          status: event.status || "running",
        };
        if (existing) Object.assign(existing, entry);
        else next.tools.push(entry);
        next.status = "running";
        break;
      }
      case "status": {
        next.status = event.status || next.status;
        break;
      }
      case "error": {
        next.status = "error";
        next.error = String(event.message || "Request failed");
        const assistant = lastOfRole(next.messages, "assistant");
        if (assistant) assistant.pending = false;
        break;
      }
      case "done": {
        const assistant = lastOfRole(next.messages, "assistant");
        if (assistant) {
          if (event.result) assistant.text = mergeAssistantText(assistant.text, event.result);
          assistant.pending = false;
        } else if (event.result) {
          next.messages.push({
            id: `assistant-${next.messages.length + 1}`,
            role: "assistant",
            text: String(event.result),
            pending: false,
          });
        }
        next.status = event.status === "cancelled" ? "cancelled" : "idle";
        next.tools = next.tools.map((tool) =>
          tool.status === "running" ? { ...tool, status: "completed" } : tool
        );
        break;
      }
      case "reset":
        return createTranscript();
      default:
        break;
    }
    return next;
  }

  function isSolidTarget(hit) {
    if (!hit || typeof hit.closest !== "function") return false;
    return Boolean(hit.closest("[data-hud-solid]"));
  }

  function hudIgnoresMouse({ hit, activeElement, hasFocus, forceSolid, ghost }) {
    if (ghost) return true;
    if (forceSolid) return false;
    if (hasFocus && isSolidTarget(activeElement)) return false;
    return !isSolidTarget(hit);
  }

  const api = {
    createTranscript,
    applyHudEvent,
    mergeAssistantText,
    formatAssistantText,
    isSolidTarget,
    hudIgnoresMouse,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HudCore = api;
})(typeof window !== "undefined" ? window : globalThis);
