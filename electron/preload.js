"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cursorHud", {
  ready: () => ipcRenderer.invoke("hud:ready"),
  sendPrompt: (payload) => ipcRenderer.invoke("hud:send", payload),
  cancel: (tabId) => ipcRenderer.invoke("hud:cancel", tabId),
  closeTab: (tabId) => ipcRenderer.invoke("hud:close-tab", tabId),
  login: () => ipcRenderer.invoke("hud:login"),
  logout: () => ipcRenderer.invoke("hud:logout"),
  listModels: () => ipcRenderer.invoke("hud:models"),
  openUrl: (url) => ipcRenderer.invoke("hud:open-url", url),
  pickWorkspace: () => ipcRenderer.invoke("hud:pick-workspace"),
  saveConfig: (config) => ipcRenderer.invoke("hud:save-config", config),
  setIgnoreMouse: (ignore) => ipcRenderer.send("hud:ignore-mouse", ignore),
  setCompact: (compact) => ipcRenderer.send("hud:compact", compact),
  windowDragStart: (kind) => ipcRenderer.send("hud:drag-start", kind),
  windowDragMove: () => ipcRenderer.send("hud:drag-move"),
  windowDragEnd: () => ipcRenderer.send("hud:drag-end"),
  focusComposer: () => ipcRenderer.send("hud:focus-composer"),
  onHudEvent: (fn) => {
    const listener = (_event, data) => fn(data);
    ipcRenderer.on("hud-event", listener);
    return () => ipcRenderer.removeListener("hud-event", listener);
  },
});
