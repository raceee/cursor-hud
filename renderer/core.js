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
        next.messages.push({
          id: event.id || `assistant-${next.messages.length + 1}`,
          role: "assistant",
          text: "",
          pending: true,
        });
        next.status = "running";
        break;
      }
      case "assistant-delta": {
        let assistant = lastOfRole(next.messages, "assistant");
        if (!assistant || !assistant.pending) {
          assistant = {
            id: event.id || `assistant-${next.messages.length + 1}`,
            role: "assistant",
            text: "",
            pending: true,
          };
          next.messages.push(assistant);
        }
        assistant.text += String(event.text || "");
        break;
      }
      case "assistant": {
        let assistant = lastOfRole(next.messages, "assistant");
        const text = String(event.text || "");
        if (!assistant || !assistant.pending) {
          next.messages.push({
            id: event.id || `assistant-${next.messages.length + 1}`,
            role: "assistant",
            text,
            pending: false,
          });
        } else if (text && text.length >= assistant.text.length) {
          assistant.text = text;
          assistant.pending = false;
        } else {
          assistant.pending = false;
        }
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
          if (event.result && !assistant.text) assistant.text = String(event.result);
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

  function hudIgnoresMouse({ hit, activeElement, hasFocus, forceSolid }) {
    if (forceSolid) return false;
    if (hasFocus && isSolidTarget(activeElement)) return false;
    return !isSolidTarget(hit);
  }

  const api = { createTranscript, applyHudEvent, isSolidTarget, hudIgnoresMouse };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HudCore = api;
})(typeof window !== "undefined" ? window : globalThis);
