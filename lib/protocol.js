"use strict";

function encodeLine(obj) {
  return JSON.stringify(obj) + "\n";
}

function createNdjsonParser(onMessage) {
  let buffer = "";
  return function push(chunk) {
    buffer += String(chunk);
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        onMessage({ event: "parse-error", line });
        continue;
      }
      onMessage(parsed);
    }
  };
}

function extractAssistantText(event) {
  if (!event || event.type !== "assistant" || !event.message) return "";
  const content = event.message.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

function extractUserText(event) {
  if (!event || event.type !== "user" || !event.message) return "";
  const content = event.message.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

module.exports = {
  encodeLine,
  createNdjsonParser,
  extractAssistantText,
  extractUserText,
};
