"use strict";

const core = window.HudCore;
const tabLib = window.HudTabs;
const hud = window.cursorHud;

const els = {
  shell: document.getElementById("shell"),
  messages: document.getElementById("messages"),
  tools: document.getElementById("tools"),
  prompt: document.getElementById("prompt"),
  send: document.getElementById("send"),
  form: document.getElementById("composer"),
  auth: document.getElementById("auth-label"),
  settings: document.getElementById("settings"),
  picker: document.getElementById("tab-picker"),
  workspace: document.getElementById("workspace"),
  model: document.getElementById("model"),
  attachScreen: document.getElementById("attach-screen"),
  loginUrl: document.getElementById("login-url"),
  tabList: document.getElementById("tab-list"),
  sameRepo: document.getElementById("same-repo"),
  recentList: document.getElementById("recent-list"),
  recentEmpty: document.getElementById("recent-empty"),
};

let config = {
  workspace: "",
  model: "composer-2.5",
  attachScreen: false,
  compact: false,
};
let tabs = [];
let activeTabId = "";
let recentWorkspaces = [];

function activeTab() {
  return tabs.find((tab) => tab.id === activeTabId) || null;
}

function persist() {
  const current = activeTab();
  hud.saveConfig({
    ...config,
    tabs: tabs.map((tab) => ({ id: tab.id, workspace: tab.workspace, title: tab.title })),
    activeTabId,
    recentWorkspaces,
    workspace: current ? current.workspace : "",
  });
}

function renderTabs() {
  els.tabList.innerHTML = "";
  for (const tab of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tab${tab.id === activeTabId ? " active" : ""}`;
    btn.title = tab.workspace;
    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title;
    const close = document.createElement("span");
    close.className = "tab-close";
    close.textContent = "×";
    close.title = "Close tab";
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });
    btn.append(title, close);
    btn.addEventListener("click", () => selectTab(tab.id));
    els.tabList.appendChild(btn);
  }
}

function renderThread() {
  const tab = activeTab();
  const state = tab ? tab.transcript : core.createTranscript();
  els.messages.innerHTML = "";
  if (!tab) {
    const empty = document.createElement("div");
    empty.className = "msg assistant";
    empty.textContent = "Open a tab to start an agent. + picks a recent repo or the same one again.";
    els.messages.appendChild(empty);
  } else if (!state.messages.length) {
    const empty = document.createElement("div");
    empty.className = "msg assistant";
    empty.textContent = `Agent on ${tab.title}. Same repo or another — each tab is its own conversation.`;
    els.messages.appendChild(empty);
  }
  if (tab) {
    for (const msg of state.messages) {
      const node = document.createElement("div");
      node.className = `msg ${msg.role}${msg.pending ? " pending" : ""}`;
      node.textContent = msg.text || (msg.pending ? "thinking" : "");
      els.messages.appendChild(node);
    }
    if (state.error) {
      const node = document.createElement("div");
      node.className = "msg error";
      node.textContent = state.error;
      els.messages.appendChild(node);
    }
  }
  els.messages.scrollTop = els.messages.scrollHeight;
  const liveTools = (state.tools || []).filter((tool) => tool.status === "running");
  els.tools.hidden = liveTools.length === 0;
  els.tools.textContent = liveTools.map((tool) => tool.name).join(" · ");
  els.send.disabled = !tab || state.status === "running" || state.status === "thinking";
  els.workspace.value = tab ? tab.workspace : "";
}

function render() {
  renderTabs();
  renderThread();
}

function setAuth(auth) {
  if (!auth) return;
  els.auth.textContent =
    auth.status === "logged-in" ? auth.email || "signed in" : "not signed in";
}

function applyConfig(next) {
  config = { ...config, ...next };
  els.model.value = config.model || "composer-2.5";
  els.attachScreen.checked = Boolean(config.attachScreen);
  els.shell.classList.toggle("is-compact", Boolean(config.compact));
  document.getElementById("toggle-compact").textContent = config.compact ? "show" : "hide";
}

function selectTab(tabId) {
  if (!tabs.some((tab) => tab.id === tabId)) return;
  activeTabId = tabId;
  persist();
  render();
}

function openTab(workspace) {
  const folder = String(workspace || "").trim();
  if (!folder) return;
  const tab = tabLib.createTab(folder, tabs);
  tab.transcript = core.createTranscript();
  tabs.push(tab);
  activeTabId = tab.id;
  recentWorkspaces = tabLib.rememberRepo(recentWorkspaces, folder);
  els.picker.hidden = true;
  persist();
  render();
}

async function closeTab(tabId) {
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;
  const [removed] = tabs.splice(index, 1);
  try {
    await hud.closeTab(tabId);
  } catch {
    /* host may not have created an agent yet */
  }
  if (activeTabId === tabId) {
    const neighbor = tabs[index] || tabs[index - 1] || tabs[0] || null;
    activeTabId = neighbor ? neighbor.id : "";
  }
  void removed;
  persist();
  render();
}

function overlayOpen() {
  return !els.settings.hidden || !els.picker.hidden;
}

function fillPicker() {
  const current = activeTab();
  if (current) {
    els.sameRepo.hidden = false;
    els.sameRepo.textContent = "";
    const label = document.createElement("span");
    label.textContent = "New agent on this repo";
    const path = document.createElement("span");
    path.className = "path";
    path.textContent = current.workspace;
    els.sameRepo.append(label, path);
  } else {
    els.sameRepo.hidden = true;
  }

  const currentKey = current ? tabLib.workspaceKey(current.workspace) : "";
  const recents = recentWorkspaces.filter((item) => tabLib.workspaceKey(item) !== currentKey);
  els.recentList.innerHTML = "";
  els.recentEmpty.hidden = recents.length > 0;
  for (const repo of recents) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    const name = document.createElement("span");
    name.textContent = tabLib.workspaceName(repo);
    const path = document.createElement("span");
    path.className = "path";
    path.textContent = repo;
    btn.append(name, path);
    btn.addEventListener("click", () => openTab(repo));
    els.recentList.appendChild(btn);
  }
}

function openPicker() {
  fillPicker();
  els.picker.hidden = false;
  hud.setIgnoreMouse(false);
}

function syncClickThrough(clientX, clientY) {
  const hit = document.elementFromPoint(clientX, clientY);
  const ignore = core.hudIgnoresMouse({
    hit,
    activeElement: document.activeElement,
    hasFocus: document.hasFocus(),
    forceSolid: overlayOpen() || document.activeElement === els.prompt,
  });
  hud.setIgnoreMouse(ignore);
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const tab = activeTab();
  const text = els.prompt.value.trim();
  if (!tab || !text || els.send.disabled) return;
  els.prompt.value = "";
  try {
    await hud.sendPrompt({
      tabId: tab.id,
      workspace: tab.workspace,
      text,
      attachScreen: els.attachScreen.checked,
    });
  } catch (err) {
    tab.transcript = core.applyHudEvent(tab.transcript, {
      kind: "error",
      message: err.message || String(err),
    });
    renderThread();
  }
});

els.prompt.addEventListener("pointerdown", () => {
  hud.setIgnoreMouse(false);
  hud.focusComposer();
});

els.prompt.addEventListener("focus", () => {
  hud.setIgnoreMouse(false);
  hud.focusComposer();
});

els.prompt.addEventListener("input", () => {
  els.prompt.style.height = "auto";
  els.prompt.style.height = Math.min(els.prompt.scrollHeight, 120) + "px";
});

els.prompt.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    els.form.requestSubmit();
  }
  if (event.key === "Escape") {
    els.picker.hidden = true;
    els.settings.hidden = true;
    els.prompt.blur();
    hud.setIgnoreMouse(true);
  }
});

document.getElementById("open-settings").addEventListener("click", () => {
  els.settings.hidden = false;
  hud.setIgnoreMouse(false);
});
document.getElementById("close-settings").addEventListener("click", () => {
  els.settings.hidden = true;
});
document.getElementById("toggle-compact").addEventListener("click", () => {
  applyConfig({ compact: !config.compact });
  hud.setCompact(config.compact);
  persist();
});
document.getElementById("new-tab").addEventListener("click", openPicker);
document.getElementById("close-picker").addEventListener("click", () => {
  els.picker.hidden = true;
});
els.sameRepo.addEventListener("click", () => {
  const current = activeTab();
  if (current) openTab(current.workspace);
});
document.getElementById("browse-repo").addEventListener("click", async () => {
  const folder = await hud.pickWorkspace();
  if (folder) openTab(folder);
});
document.getElementById("login").addEventListener("click", async () => {
  try {
    await hud.login();
  } catch (err) {
    els.loginUrl.hidden = false;
    els.loginUrl.textContent = err.message || String(err);
  }
});
document.getElementById("logout").addEventListener("click", () => hud.logout());
els.model.addEventListener("change", () => {
  config.model = els.model.value;
  persist();
});
els.attachScreen.addEventListener("change", () => {
  config.attachScreen = els.attachScreen.checked;
  persist();
});

window.addEventListener("mousemove", (event) => {
  syncClickThrough(event.clientX, event.clientY);
});
window.addEventListener("blur", () => {
  if (document.activeElement === els.prompt) return;
  hud.setIgnoreMouse(true);
});
window.addEventListener("focus", () => hud.setIgnoreMouse(false));

hud.onHudEvent((msg) => {
  if (!msg) return;
  if (msg.event === "focus-composer") {
    els.prompt.focus();
    return;
  }
  if (msg.event === "login-url") {
    els.loginUrl.hidden = false;
    els.loginUrl.textContent = `Open ${msg.url} to finish signing in.`;
  }
  if (msg.event === "hud") {
    const tab = tabs.find((item) => item.id === msg.tabId) || activeTab();
    if (!tab) return;
    tab.transcript = core.applyHudEvent(tab.transcript, msg);
    if (tab.id === activeTabId) renderThread();
    else renderTabs();
  }
});

hud.ready().then((info) => {
  const loaded = info.config || {};
  applyConfig(loaded);
  recentWorkspaces = Array.isArray(loaded.recentWorkspaces) ? loaded.recentWorkspaces.slice() : [];
  tabs = (loaded.tabs || []).map((tab) => ({
    ...tab,
    transcript: core.createTranscript(),
  }));
  activeTabId = loaded.activeTabId || (tabs[0] && tabs[0].id) || "";
  setAuth(info.auth);
  render();
  if (!tabs.length) openPicker();
});
