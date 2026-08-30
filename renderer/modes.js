"use strict";

(function (root) {
  const MODES = [
    {
      id: "agent",
      label: "Agent",
      description: "Build and edit with full tools",
      placeholder: "Plan, @ for context, / for commands",
      sdkMode: "agent",
    },
    {
      id: "plan",
      label: "Plan",
      description: "Design an approach before coding",
      placeholder: "Describe what you want to build…",
      sdkMode: "plan",
    },
    {
      id: "ask",
      label: "Ask",
      description: "Explore code without making changes",
      placeholder: "Ask about this codebase…",
      sdkMode: "ask",
      disallowedTools: ["shell", "edit", "delete", "task", "applyAgentDiff", "generateImage"],
    },
    {
      id: "debug",
      label: "Debug",
      description: "Diagnose and fix issues",
      placeholder: "Describe a bug or unexpected behavior…",
      sdkMode: "debug",
    },
  ];

  function listModes() {
    return MODES.slice();
  }

  function normalizeMode(id) {
    const wanted = String(id || "").trim().toLowerCase();
    return MODES.some((mode) => mode.id === wanted) ? wanted : "agent";
  }

  function getMode(id) {
    return MODES.find((mode) => mode.id === normalizeMode(id)) || MODES[0];
  }

  function resolveModeOptions(id) {
    const mode = getMode(id);
    const options = { sdkMode: mode.sdkMode };
    if (Array.isArray(mode.tools) && mode.tools.length) options.tools = mode.tools.slice();
    if (Array.isArray(mode.disallowedTools) && mode.disallowedTools.length) {
      options.disallowedTools = mode.disallowedTools.slice();
    }
    return options;
  }

  function modeIconSvg(id) {
    switch (normalizeMode(id)) {
      case "plan":
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3.5h8M4 7h8M4 10.5h5" /></svg>';
      case "ask":
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 4.8a4.5 4.5 0 0 1 8.3 2.2c-.7 1.9-2.4 2.5-3.8 3.1-1 .5-1.3.9-1.3 1.6V13M8 14.2h.01" /></svg>';
      case "debug":
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.2 3.2 5 1.8M9.8 3.2 11 1.8M8 3.2V2M3.6 6.6 2.2 5.4M12.4 6.6l1.4-1.2M3.6 9.4 2.2 10.6M12.4 9.4l1.4 1.2M8 13v1.2M5.5 8a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0Z" /></svg>';
      default:
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6 9.7 6h4.6L10.8 8.8 12.4 13 8 10.4 3.6 13l1.6-4.2L1.7 6h4.6L8 1.6Z" /></svg>';
    }
  }

  const api = {
    listModes,
    normalizeMode,
    getMode,
    resolveModeOptions,
    modeIconSvg,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HudModes = api;
})(typeof window !== "undefined" ? window : globalThis);
