"use strict";

const { normalizeTabs, rememberRepo } = require("./tabs");

const DEFAULTS = {
  workspace: "",
  model: "composer-2.5",
  modelParams: [],
  attachScreen: false,
  compact: false,
  bounds: null,
  tabs: [],
  activeTabId: "",
  recentWorkspaces: [],
};

function normalizeBounds(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (![x, y, width, height].every((value) => Number.isFinite(value))) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(320, Math.round(width)),
    height: Math.max(160, Math.round(height)),
  };
}

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
    modelParams: Array.isArray(input.modelParams)
      ? input.modelParams.filter((param) => param && typeof param.id === "string")
      : [],
    attachScreen: Boolean(input.attachScreen),
    compact: Boolean(input.compact),
    bounds: normalizeBounds(input.bounds),
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
  normalizeBounds,
  normalizeConfig,
  validateWorkspace,
};
