"use strict";

const { normalizeTabs, rememberRepo } = require("./tabs");

const DEFAULTS = {
  workspace: "",
  model: "composer-2.5",
  attachScreen: false,
  compact: false,
  tabs: [],
  activeTabId: "",
  recentWorkspaces: [],
};

function normalizeConfig(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const tabs = normalizeTabs(input.tabs);
  const recentWorkspaces = rememberRepo(
    Array.isArray(input.recentWorkspaces) ? input.recentWorkspaces : [],
    "",
    12
  );
  let workspace = typeof input.workspace === "string" ? input.workspace.trim() : "";
  if (!tabs.length && workspace) {
    tabs.push(...normalizeTabs([{ workspace }]));
  }
  const seededRecent = tabs.reduce(
    (list, tab) => rememberRepo(list, tab.workspace),
    recentWorkspaces
  );
  let activeTabId = typeof input.activeTabId === "string" ? input.activeTabId : "";
  if (tabs.length && !tabs.some((tab) => tab.id === activeTabId)) {
    activeTabId = tabs[0].id;
  }
  if (!workspace && tabs.length) {
    const active = tabs.find((tab) => tab.id === activeTabId) || tabs[0];
    workspace = active.workspace;
  }
  return {
    workspace,
    model: typeof input.model === "string" && input.model.trim() ? input.model.trim() : DEFAULTS.model,
    attachScreen: Boolean(input.attachScreen),
    compact: Boolean(input.compact),
    tabs,
    activeTabId,
    recentWorkspaces: seededRecent,
  };
}

function validateWorkspace(workspace) {
  if (!workspace) return "Pick the project folder Cursor should work in.";
  return null;
}

module.exports = {
  DEFAULTS,
  normalizeConfig,
  validateWorkspace,
};
