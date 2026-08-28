"use strict";

(function (root) {
  const RECENT_LIMIT = 12;

  function workspaceKey(workspace) {
    return String(workspace || "")
      .trim()
      .replace(/[\\/]+$/, "")
      .replace(/\\/g, "/")
      .toLowerCase();
  }

  function workspaceName(workspace) {
    const parts = String(workspace || "")
      .trim()
      .replace(/[\\/]+$/, "")
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean);
    return parts[parts.length - 1] || workspace || "Agent";
  }

  function rememberRepo(recent, workspace, limit) {
    const max = Number.isFinite(limit) ? limit : RECENT_LIMIT;
    const incoming = String(workspace || "").trim().replace(/[\\/]+$/, "");
    if (!incoming) return Array.isArray(recent) ? recent.slice(0, max) : [];
    const key = workspaceKey(incoming);
    const rest = (Array.isArray(recent) ? recent : []).filter(
      (item) => workspaceKey(item) && workspaceKey(item) !== key
    );
    return [incoming, ...rest].slice(0, max);
  }

  function makeTabId() {
    return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function nextTabTitle(workspace, tabs) {
    const name = workspaceName(workspace);
    const key = workspaceKey(workspace);
    const count = (tabs || []).filter((tab) => workspaceKey(tab.workspace) === key).length;
    return count === 0 ? name : `${name} ${count + 1}`;
  }

  function createTab(workspace, tabs, id) {
    const folder = String(workspace || "").trim().replace(/[\\/]+$/, "");
    return {
      id: id || makeTabId(),
      workspace: folder,
      title: nextTabTitle(folder, tabs || []),
    };
  }

  function normalizeTabs(rawTabs) {
    if (!Array.isArray(rawTabs)) return [];
    const tabs = [];
    for (const item of rawTabs) {
      if (!item || typeof item !== "object") continue;
      const workspace = typeof item.workspace === "string" ? item.workspace.trim() : "";
      if (!workspace) continue;
      const id = typeof item.id === "string" && item.id ? item.id : makeTabId();
      const title =
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim()
          : nextTabTitle(workspace, tabs);
      tabs.push({ id, workspace, title });
    }
    return tabs;
  }

  const api = {
    RECENT_LIMIT,
    workspaceKey,
    workspaceName,
    rememberRepo,
    makeTabId,
    nextTabTitle,
    createTab,
    normalizeTabs,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HudTabs = api;
})(typeof window !== "undefined" ? window : globalThis);
