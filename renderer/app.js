"use strict";

const core = window.HudCore;
const tabLib = window.HudTabs;
const modelsLib = window.HudModels;
const markdown = window.HudMarkdown;
const hud = window.cursorHud;

const els = {
  shell: document.getElementById("shell"),
  messages: document.getElementById("messages"),
  tools: document.getElementById("tools"),
  prompt: document.getElementById("prompt"),
  send: document.getElementById("send"),
  form: document.getElementById("composer"),
  auth: document.getElementById("auth-label"),
  authBanner: document.getElementById("auth-banner"),
  authBannerText: document.getElementById("auth-banner-text"),
  openLoginUrl: document.getElementById("open-login-url"),
  settings: document.getElementById("settings"),
  picker: document.getElementById("tab-picker"),
  workspace: document.getElementById("workspace"),
  modelChip: document.getElementById("model-chip"),
  modelLabel: document.getElementById("model-label"),
  modelMenu: document.getElementById("model-menu"),
  modelList: document.getElementById("model-list"),
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
  modelParams: [],
  attachScreen: false,
  compact: false,
};
let tabs = [];
let activeTabId = "";
let recentWorkspaces = [];
let modelOptions = [];
let loginUrl = "";
let authState = { status: "logged-out" };
let ghosted = false;
let dragging = false;

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

function selectedModel() {
  return (
    modelsLib.findModelOption(modelOptions, config.model, config.modelParams) || {
      id: config.model,
      params: config.modelParams || [],
      label: config.model,
    }
  );
}

function renderModelMenu() {
  els.modelList.innerHTML = "";
  if (!modelOptions.length) {
    const empty = document.createElement("div");
    empty.className = "menu-title";
    empty.textContent = authState.status === "logged-in" ? "No models returned." : "Sign in to load models.";
    els.modelList.appendChild(empty);
    return;
  }
  const current = modelsLib.optionKey(selectedModel());
  for (const option of modelOptions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `menu-item${modelsLib.optionKey(option) === current ? " selected" : ""}`;
    const name = document.createElement("span");
    name.textContent = option.label;
    btn.appendChild(name);
    if (option.description) {
      const desc = document.createElement("span");
      desc.className = "desc";
      desc.textContent = option.description;
      btn.appendChild(desc);
    }
    btn.addEventListener("click", () => {
      config.model = option.id;
      config.modelParams = option.params || [];
      els.modelMenu.hidden = true;
      persist();
      renderModelChip();
    });
    els.modelList.appendChild(btn);
  }
}

function renderModelChip() {
  els.modelLabel.textContent = selectedModel().label || config.model || "Model";
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
    empty.textContent = "Open a tab to start an agent.";
    els.messages.appendChild(empty);
  } else if (!state.messages.length) {
    const empty = document.createElement("div");
    empty.className = "msg assistant";
    empty.textContent = `Agent on ${tab.title}. Ask Cursor about this repo.`;
    els.messages.appendChild(empty);
  }
  if (tab) {
    for (const msg of state.messages) {
      const node = document.createElement("div");
      node.className = `msg ${msg.role}${msg.pending ? " pending" : ""}`;
      const raw = msg.role === "assistant" ? core.formatAssistantText(msg.text) : msg.text || "";
      if (msg.role === "assistant" || (raw && raw.includes("```"))) {
        markdown.renderMarkdown(node, raw || (msg.pending ? "" : ""));
      } else {
        node.textContent = raw || (msg.pending ? "" : "");
      }
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
  renderModelChip();
}

function setAuth(auth) {
  if (!auth) return;
  authState = auth;
  const signedIn = auth.status === "logged-in";
  const email = auth.email || "your Cursor account";
  els.auth.textContent = signedIn ? email : "not signed in";
  document.getElementById("banner-login").hidden = signedIn || Boolean(loginUrl);
  document.getElementById("setup-auth-dot").dataset.state = signedIn ? "in" : "out";
  document.getElementById("setup-auth-state").textContent = signedIn ? "Signed in" : "Signed out";
  document.getElementById("setup-auth-detail").textContent = signedIn
    ? email
    : "Sign in to use Cursor agents from this overlay.";
  document.getElementById("login").disabled = signedIn;
  document.getElementById("logout").disabled = !signedIn;
  if (signedIn) {
    els.authBanner.hidden = true;
    els.openLoginUrl.hidden = true;
    loginUrl = "";
  } else if (!loginUrl) {
    els.authBanner.hidden = false;
    els.authBannerText.textContent = "Sign in to Cursor to use the HUD.";
    els.openLoginUrl.hidden = true;
  }
}

function setLoginPending(url) {
  loginUrl = url || loginUrl;
  els.authBanner.hidden = false;
  els.authBannerText.textContent = "Finish signing in in your browser…";
  document.getElementById("banner-login").hidden = true;
  els.openLoginUrl.hidden = !loginUrl;
  if (loginUrl) {
    els.loginUrl.hidden = false;
    els.loginUrl.textContent = loginUrl;
  }
}

function applyConfig(next) {
  config = { ...config, ...next };
  if (!Array.isArray(config.modelParams)) config.modelParams = [];
  els.attachScreen.checked = Boolean(config.attachScreen);
  els.shell.classList.toggle("is-compact", Boolean(config.compact));
  document.getElementById("toggle-compact").textContent = config.compact ? "Show" : "Hide";
  renderModelChip();
}

function applyModels(options) {
  modelOptions = Array.isArray(options) ? options : [];
  const match = selectedModel();
  if (match && match.id) {
    config.model = match.id;
    config.modelParams = match.params || [];
  }
  renderModelChip();
  if (!els.modelMenu.hidden) renderModelMenu();
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
  tabs.splice(index, 1);
  try {
    await hud.closeTab(tabId);
  } catch {
    /* host may not have created an agent yet */
  }
  if (activeTabId === tabId) {
    const neighbor = tabs[index] || tabs[index - 1] || tabs[0] || null;
    activeTabId = neighbor ? neighbor.id : "";
  }
  persist();
  render();
}

function overlayOpen() {
  return !els.settings.hidden || !els.picker.hidden || !els.modelMenu.hidden;
}

function bindWindowChrome(handle, kind) {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || ghosted) return;
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    hud.setIgnoreMouse(false);
    hud.windowDragStart(kind);
    event.preventDefault();
  });
  handle.addEventListener("pointermove", (event) => {
    if (!dragging || !handle.hasPointerCapture(event.pointerId)) return;
    hud.windowDragMove();
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    hud.windowDragEnd();
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
}

function syncClickThrough(clientX, clientY) {
  if (ghosted || dragging) return;
  const hit = document.elementFromPoint(clientX, clientY);
  const ignore = core.hudIgnoresMouse({
    hit,
    activeElement: document.activeElement,
    hasFocus: document.hasFocus(),
    forceSolid: overlayOpen() || document.activeElement === els.prompt,
    ghost: ghosted,
  });
  hud.setIgnoreMouse(ignore);
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

async function startLogin() {
  setLoginPending(loginUrl);
  try {
    const result = await hud.login();
    if (result && (result.status === "logged-in" || result.email)) {
      setAuth({
        status: "logged-in",
        email: result.email || "signed in",
        apiKeyExpiresAtMs: result.apiKeyExpiresAtMs,
      });
      try {
        applyModels(await hud.listModels());
      } catch {
        /* models load after auth event */
      }
    }
  } catch (err) {
    els.authBanner.hidden = false;
    els.authBannerText.textContent = err.message || String(err);
    els.loginUrl.hidden = false;
    els.loginUrl.textContent = err.message || String(err);
  }
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
  els.prompt.style.height = Math.min(els.prompt.scrollHeight, 140) + "px";
});

els.prompt.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    els.form.requestSubmit();
  }
  if (event.key === "Escape") {
    els.picker.hidden = true;
    els.settings.hidden = true;
    els.modelMenu.hidden = true;
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
document.getElementById("login").addEventListener("click", startLogin);
document.getElementById("banner-login").addEventListener("click", startLogin);
els.openLoginUrl.addEventListener("click", () => {
  if (loginUrl) hud.openUrl(loginUrl);
});
document.getElementById("logout").addEventListener("click", async () => {
  await hud.logout();
  applyModels([]);
  setAuth({ status: "logged-out" });
});
els.modelChip.addEventListener("click", () => {
  const open = els.modelMenu.hidden;
  els.modelMenu.hidden = !open;
  if (open) {
    renderModelMenu();
    hud.setIgnoreMouse(false);
  }
});
els.attachScreen.addEventListener("change", () => {
  config.attachScreen = els.attachScreen.checked;
  persist();
});

window.addEventListener("mousemove", (event) => {
  syncClickThrough(event.clientX, event.clientY);
});
window.addEventListener("blur", () => {
  if (ghosted || dragging) return;
  if (document.activeElement === els.prompt) return;
  hud.setIgnoreMouse(true);
});
window.addEventListener("focus", () => {
  if (ghosted) return;
  hud.setIgnoreMouse(false);
});

hud.onHudEvent((msg) => {
  if (!msg) return;
  if (msg.event === "ghost") {
    ghosted = Boolean(msg.ghost);
    document.documentElement.classList.toggle("is-ghost", ghosted);
    return;
  }
  if (msg.event === "focus-composer") {
    els.prompt.focus();
    return;
  }
  if (msg.event === "login-pending") {
    setLoginPending();
    return;
  }
  if (msg.event === "login-url") {
    setLoginPending(msg.url);
    return;
  }
  if (msg.event === "auth") {
    setAuth(msg);
    return;
  }
  if (msg.event === "models") {
    applyModels(msg.options || msg);
    persist();
    return;
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
  applyModels(info.models);
  render();
  if (!tabs.length) openPicker();
});

bindWindowChrome(document.getElementById("drag-handle"), "move");
bindWindowChrome(document.getElementById("resize-handle"), "resize");
