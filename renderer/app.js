"use strict";

const core = window.HudCore;
const tabLib = window.HudTabs;
const modesLib = window.HudModes;
const modelsLib = window.HudModels;
const markdown = window.HudMarkdown;
const activity = window.HudActivity;
const contextLib = window.HudContext;
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
  modeChip: document.getElementById("mode-chip"),
  modeIcon: document.getElementById("mode-icon"),
  modeLabel: document.getElementById("mode-label"),
  modeMenu: document.getElementById("mode-menu"),
  modeList: document.getElementById("mode-list"),
  modelChip: document.getElementById("model-chip"),
  modelLabel: document.getElementById("model-label"),
  modelMenu: document.getElementById("model-menu"),
  modelList: document.getElementById("model-list"),
  attachScreen: document.getElementById("attach-screen"),
  debugTraces: document.getElementById("debug-traces"),
  loginUrl: document.getElementById("login-url"),
  tabList: document.getElementById("tab-list"),
  sameRepo: document.getElementById("same-repo"),
  recentList: document.getElementById("recent-list"),
  recentEmpty: document.getElementById("recent-empty"),
};

let config = {
  workspace: "",
  mode: "agent",
  model: "composer-2.5",
  modelParams: [],
  attachScreen: false,
  compact: false,
  debug: true,
};
let tabs = [];
let activeTabId = "";
let recentWorkspaces = [];
let modelOptions = [];
let loginUrl = "";
let authState = { status: "logged-out" };
let ghosted = false;
let dragging = false;
let booted = false;

function activeTab() {
  return tabs.find((tab) => tab.id === activeTabId) || null;
}

function persist() {
  if (!booted) return;
  const current = activeTab();
  hud.saveConfig({
    ...config,
    tabs: tabs.map((tab) => ({
      id: tab.id,
      workspace: tab.workspace,
      title: tab.title,
      agentId: tab.agentId || "",
      messages: contextLib.slimMessages(tab.transcript && tab.transcript.messages),
    })),
    activeTabId,
    recentWorkspaces,
    workspace: current ? current.workspace : "",
  });
  writeSnapshot(true);
}

let snapshotTimer = 0;
function writeSnapshot(force) {
  if (!hud.writeTrace || config.debug === false) return;
  const send = () => {
    const tab = activeTab();
    hud.writeTrace({
      op: "snapshot",
      mode: config.mode,
      ghosted,
      tab,
    }).catch(() => {});
  };
  if (force) {
    clearTimeout(snapshotTimer);
    send();
    return;
  }
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(send, 120);
}

function selectedMode() {
  return modesLib.getMode(config.mode);
}

function renderModeMenu() {
  els.modeList.innerHTML = "";
  const current = selectedMode().id;
  for (const mode of modesLib.listModes()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `menu-item${mode.id === current ? " selected" : ""}`;
    const name = document.createElement("span");
    name.className = "name";
    const label = document.createElement("span");
    label.textContent = mode.label;
    name.appendChild(label);
    if (mode.description) {
      const desc = document.createElement("span");
      desc.className = "desc";
      desc.textContent = mode.description;
      name.appendChild(desc);
    }
    btn.appendChild(name);
    btn.addEventListener("click", () => {
      config.mode = mode.id;
      els.modeMenu.hidden = true;
      persist();
      renderModeChip();
    });
    els.modeList.appendChild(btn);
  }
}

function renderModeChip() {
  const mode = selectedMode();
  els.modeLabel.textContent = mode.label;
  els.modeIcon.innerHTML = modesLib.modeIconSvg(mode.id);
  els.modeChip.title = `${mode.label} mode`;
  els.prompt.placeholder = mode.placeholder || els.prompt.placeholder;
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
  const label = selectedModel().label || config.model || "Model";
  els.modelLabel.textContent = label;
  document.querySelectorAll("[data-model-label]").forEach((node) => {
    node.textContent = label;
  });
}

function openModelMenu() {
  const open = els.modelMenu.hidden;
  els.modeMenu.hidden = true;
  els.modelMenu.hidden = !open;
  if (open) {
    renderModelMenu();
    hud.setIgnoreMouse(false);
  }
}

const CHIP_CHEVRON =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 8l3-3.5" /></svg>';

function renderPlanActions(parent) {
  const bar = document.createElement("div");
  bar.className = "plan-actions";

  const modelBtn = document.createElement("button");
  modelBtn.type = "button";
  modelBtn.className = "chip";
  modelBtn.title = "Model for this build";
  const modelLabel = document.createElement("span");
  modelLabel.dataset.modelLabel = "1";
  modelLabel.textContent = selectedModel().label || config.model || "Model";
  modelBtn.appendChild(modelLabel);
  modelBtn.insertAdjacentHTML("beforeend", CHIP_CHEVRON);
  modelBtn.addEventListener("click", (event) => {
    event.preventDefault();
    openModelMenu();
  });

  const build = document.createElement("button");
  build.type = "button";
  build.className = "plan-build";
  build.textContent = "Build";
  build.addEventListener("click", (event) => {
    event.preventDefault();
    buildPlan();
  });

  bar.append(modelBtn, build);
  parent.appendChild(bar);
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

function renderActivity(parent, state) {
  const tools = state.tools || [];
  const busy = state.status === "running" || state.status === "thinking";
  const thought = activity.lastThinkingLine(state.thinking);
  const hasAssistantText = (state.messages || []).some((msg) => msg.role === "assistant" && msg.text);
  if (!tools.length && !thought && !(busy && !hasAssistantText)) return;

  const box = document.createElement("div");
  box.className = "activity";
  if (thought && busy) {
    const row = document.createElement("div");
    row.className = "activity-row is-think";
    row.textContent = thought;
    box.appendChild(row);
  } else if (busy && !tools.some((tool) => tool.status === "running") && !hasAssistantText) {
    const row = document.createElement("div");
    row.className = "activity-row is-live";
    row.textContent = "Thinking…";
    box.appendChild(row);
  }
  for (const tool of tools) {
    const row = document.createElement("div");
    const status = activity.normalizeToolStatus(tool.status);
    row.className = `activity-row${status === "running" ? " is-live" : status === "error" ? " is-error" : " is-done"}`;
    row.textContent = activity.formatToolLine(tool);
    box.appendChild(row);
  }
  parent.appendChild(box);
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
    const lastAssistant = state.messages.reduce((found, msg, index) => (msg.role === "assistant" ? index : found), -1);
    state.messages.forEach((msg, index) => {
      if (index === lastAssistant) renderActivity(els.messages, state);
      const node = document.createElement("div");
      node.className = `msg ${msg.role}${msg.pending ? " pending" : ""}`;
      const raw = msg.role === "assistant" ? core.formatAssistantText(msg.text) : msg.text || "";
      if (msg.role === "assistant" || (raw && raw.includes("```"))) {
        markdown.renderMarkdown(node, raw || (msg.pending ? "" : ""));
      } else {
        node.textContent = raw || (msg.pending ? "" : "");
      }
      if (msg.role === "assistant" && !raw && msg.pending) node.classList.add("is-empty");
      if (
        index === lastAssistant &&
        !msg.pending &&
        activity.hasReadyPlan(state, config.mode)
      ) {
        node.classList.add("is-plan");
        renderPlanActions(node);
      }
      els.messages.appendChild(node);
    });
    if (lastAssistant === -1) renderActivity(els.messages, state);
    if (state.error) {
      const node = document.createElement("div");
      node.className = "msg error";
      node.textContent = state.error;
      els.messages.appendChild(node);
    }
  }
  els.messages.scrollTop = els.messages.scrollHeight;
  const liveTools = (state.tools || []).filter((tool) => activity.normalizeToolStatus(tool.status) === "running");
  const thought = activity.lastThinkingLine(state.thinking);
  const busy = state.status === "running" || state.status === "thinking";
  if (liveTools.length) {
    els.tools.hidden = false;
    els.tools.textContent = liveTools.map((tool) => activity.formatToolLine(tool)).join(" · ");
  } else if (busy && thought) {
    els.tools.hidden = false;
    els.tools.textContent = thought;
  } else if (busy) {
    els.tools.hidden = false;
    els.tools.textContent = "Thinking…";
  } else {
    els.tools.hidden = true;
    els.tools.textContent = "";
  }
  setSendButton(Boolean(tab && busy), !tab);
  els.workspace.value = tab ? tab.workspace : "";
}

function render() {
  renderTabs();
  renderThread();
  renderModeChip();
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
    : "Sign in to use Cursor agents.";
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
  config.mode = modesLib.normalizeMode(config.mode);
  if (!Array.isArray(config.modelParams)) config.modelParams = [];
  els.attachScreen.checked = Boolean(config.attachScreen);
  if (els.debugTraces) els.debugTraces.checked = config.debug !== false;
  els.shell.classList.toggle("is-compact", Boolean(config.compact));
  document.getElementById("toggle-compact").textContent = config.compact ? "Show" : "Hide";
  renderModeChip();
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
  return !els.settings.hidden || !els.picker.hidden || !els.modelMenu.hidden || !els.modeMenu.hidden;
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

els.messages.addEventListener("click", (event) => {
  const link = event.target.closest("a.md-link");
  if (!link || !link.href) return;
  event.preventDefault();
  hud.openUrl(link.href);
});

const SEND_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12.5V3.6M4.2 7.2 8 3.5l3.8 3.7" /></svg>';
const STOP_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7" rx="1.2" /></svg>';

function setSendButton(stopping, disabled) {
  els.send.classList.toggle("stop", stopping);
  els.send.type = stopping ? "button" : "submit";
  els.send.title = stopping ? "Stop" : "Send";
  els.send.setAttribute("aria-label", stopping ? "Stop" : "Send");
  els.send.disabled = Boolean(disabled);
  const kind = stopping ? "stop" : "send";
  if (els.send.dataset.kind !== kind) {
    els.send.dataset.kind = kind;
    els.send.innerHTML = stopping ? STOP_ICON : SEND_ICON;
  }
}

async function stopRun() {
  const tab = activeTab();
  if (!tab) return;
  els.send.disabled = true;
  try {
    await hud.cancel(tab.id);
  } catch (err) {
    tab.transcript = core.applyHudEvent(tab.transcript, {
      kind: "error",
      message: err.message || String(err),
    });
    renderThread();
  }
}

els.send.addEventListener("click", (event) => {
  if (!els.send.classList.contains("stop")) return;
  event.preventDefault();
  stopRun();
});

async function sendToAgent(text, options) {
  const tab = activeTab();
  const prompt = String(text || "").trim();
  if (!tab || !prompt || els.send.disabled) return;
  const mode = modesLib.normalizeMode((options && options.mode) || config.mode);
  if (options && options.mode) {
    config.mode = mode;
    renderModeChip();
    persist();
  }
  try {
    await hud.sendPrompt({
      tabId: tab.id,
      workspace: tab.workspace,
      text: prompt,
      attachScreen: els.attachScreen.checked,
      mode,
      agentId: tab.agentId || "",
      messages: contextLib.slimMessages(tab.transcript && tab.transcript.messages),
    });
  } catch (err) {
    tab.transcript = core.applyHudEvent(tab.transcript, {
      kind: "error",
      message: err.message || String(err),
    });
    renderThread();
  }
}

async function buildPlan() {
  await sendToAgent("Build this plan.", { mode: "agent" });
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = els.prompt.value.trim();
  if (!text || els.send.disabled) return;
  els.prompt.value = "";
  await sendToAgent(text);
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
    const tab = activeTab();
    const running = tab && (tab.transcript.status === "running" || tab.transcript.status === "thinking");
    els.picker.hidden = true;
    els.settings.hidden = true;
    els.modelMenu.hidden = true;
    els.modeMenu.hidden = true;
    if (running) {
      event.preventDefault();
      stopRun();
      return;
    }
    els.prompt.blur();
    hud.setIgnoreMouse(true);
  }
});

function quitHud() {
  if (!hud.quit) return;
  hud.quit();
}

document.getElementById("quit-hud").addEventListener("click", quitHud);
document.getElementById("quit-hud-setup").addEventListener("click", quitHud);

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
  openModelMenu();
});
els.modeChip.addEventListener("click", () => {
  const open = els.modeMenu.hidden;
  els.modelMenu.hidden = true;
  els.modeMenu.hidden = !open;
  if (open) {
    renderModeMenu();
    hud.setIgnoreMouse(false);
  }
});
els.attachScreen.addEventListener("change", () => {
  config.attachScreen = els.attachScreen.checked;
  persist();
});
if (els.debugTraces) {
  els.debugTraces.addEventListener("change", () => {
    config.debug = els.debugTraces.checked;
    persist();
  });
}

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
  if (msg.event === "agent") {
    const tab = tabs.find((item) => item.id === msg.tabId) || activeTab();
    if (tab && msg.agentId) {
      tab.agentId = msg.agentId;
      persist();
    }
    return;
  }
  if (msg.event === "hud") {
    const tab = tabs.find((item) => item.id === msg.tabId) || activeTab();
    if (!tab) return;
    tab.transcript = core.applyHudEvent(tab.transcript, msg);
    if (tab.id === activeTabId) renderThread();
    else renderTabs();
    writeSnapshot(msg.kind === "done" || msg.kind === "error" || msg.kind === "user");
    if (msg.kind === "done" || msg.kind === "error" || msg.kind === "user") persist();
  }
});

hud.ready().then((info) => {
  const loaded = info.config || {};
  applyConfig(loaded);
  recentWorkspaces = Array.isArray(loaded.recentWorkspaces) ? loaded.recentWorkspaces.slice() : [];
  tabs = (loaded.tabs || []).map((tab) => ({
    ...tab,
    agentId: tab.agentId || "",
    transcript: contextLib.restoreTranscript(core.createTranscript, tab.messages),
  }));
  activeTabId = loaded.activeTabId || (tabs[0] && tabs[0].id) || "";
  setAuth(info.auth);
  applyModels(info.models);
  booted = true;
  persist();
  render();
  if (!tabs.length) openPicker();
});

bindWindowChrome(document.getElementById("drag-handle"), "move");
bindWindowChrome(document.getElementById("resize-handle"), "resize");
