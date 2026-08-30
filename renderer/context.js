"use strict";

(function (root) {
  const MAX_TURNS = 12;
  const MAX_CHARS = 2000;

  function slimMessages(messages, limit) {
    const max = Number.isFinite(limit) ? limit : MAX_TURNS;
    if (!Array.isArray(messages)) return [];
    const out = [];
    for (const item of messages) {
      if (!item || (item.role !== "user" && item.role !== "assistant")) continue;
      const text = String(item.text || "").trim();
      if (!text) continue;
      out.push({
        role: item.role,
        text: text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…` : text,
      });
    }
    return out.slice(-max);
  }

  function priorTurns(messages, userText) {
    const slim = slimMessages(messages);
    const prompt = String(userText || "").trim();
    if (
      slim.length &&
      slim[slim.length - 1].role === "user" &&
      slim[slim.length - 1].text === prompt
    ) {
      slim.pop();
    }
    return slim;
  }

  function attachHistory(messages, userText) {
    const prompt = String(userText || "").trim();
    const prior = priorTurns(messages, prompt);
    if (!prior.length) return prompt;
    const body = prior
      .map((item) => `${item.role === "user" ? "User" : "Assistant"}:\n${item.text}`)
      .join("\n\n");
    return `This is a continuation of our conversation. Use the prior turns as context.\n\n${body}\n\nUser:\n${prompt}`;
  }

  function restoreTranscript(createTranscript, messages) {
    const state = createTranscript();
    state.messages = slimMessages(messages).map((item, index) => ({
      id: `${item.role}-${index + 1}`,
      role: item.role,
      text: item.text,
      pending: false,
    }));
    return state;
  }

  const api = {
    slimMessages,
    priorTurns,
    attachHistory,
    restoreTranscript,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HudContext = api;
})(typeof window !== "undefined" ? window : globalThis);
