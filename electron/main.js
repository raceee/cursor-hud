"use strict";

const { app, BrowserWindow, globalShortcut, ipcMain, dialog, screen, desktopCapturer, shell } =
  require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createNdjsonParser, encodeLine } = require("../lib/protocol");
const { normalizeConfig } = require("../lib/config");

let hudWindow = null;
let host = null;
let nextId = 1;
const pending = new Map();
let config = normalizeConfig({});
let hostReady = Promise.resolve();
let resolveHostReady = () => {};

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function loadConfig() {
  try {
    config = normalizeConfig(JSON.parse(fs.readFileSync(configPath(), "utf8")));
  } catch {
    config = normalizeConfig({});
  }
  return config;
}

function saveConfig(next) {
  config = normalizeConfig({ ...config, ...next });
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  if (host && host.child.stdin.writable) {
    sendToHost({ op: "configure", config });
  }
  return config;
}

function findNodeBinary() {
  if (process.env.CURSOR_HUD_NODE) return process.env.CURSOR_HUD_NODE;
  if (process.execPath && !/electron/i.test(process.execPath)) return process.execPath;
  return "node";
}

function sendToHost(payload) {
  return new Promise((resolve, reject) => {
    if (!host || !host.child.stdin.writable) {
      reject(new Error("Cursor agent host is not running."));
      return;
    }
    const id = nextId++;
    pending.set(id, { resolve, reject });
    host.child.stdin.write(encodeLine({ id, ...payload }));
  });
}

function emitToRenderer(data) {
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.webContents.send("hud-event", data);
  }
}

function focusHudForTyping() {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  hudWindow.setIgnoreMouseEvents(false);
  hudWindow.setAlwaysOnTop(true, "screen-saver");
  if (typeof hudWindow.moveTop === "function") hudWindow.moveTop();
  hudWindow.show();
  hudWindow.focus();
  hudWindow.webContents.focus();
}

function startHost() {
  hostReady = new Promise((resolve) => {
    resolveHostReady = resolve;
  });
  const hostPath = path.join(__dirname, "..", "host", "agent-host.js");
  const child = spawn(findNodeBinary(), [hostPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
  const parse = createNdjsonParser((msg) => {
    if (msg && msg.event === "ready") resolveHostReady();
    if (msg && msg.id != null && pending.has(msg.id)) {
      const waiter = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.ok) waiter.resolve(msg.result);
      else waiter.reject(new Error(msg.error || "Host error"));
      return;
    }
    emitToRenderer(msg);
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", parse);
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });
  child.on("exit", (code) => {
    resolveHostReady();
    emitToRenderer({
      event: "hud",
      kind: "error",
      message: `Agent host exited (${code ?? "unknown"}). Restart Cursor HUD.`,
    });
  });
  host = { child };
  hostReady.then(() => sendToHost({ op: "configure", config: loadConfig() })).catch(() => {});
}

function createHudWindow() {
  const display = screen.getPrimaryDisplay();
  const width = 420;
  const height = config.compact ? 128 : 560;
  const x = display.workArea.x + 28;
  const y = display.workArea.y + display.workArea.height - height - 28;

  hudWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    title: "Cursor HUD",
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    focusable: true,
    acceptFirstMouse: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  // Never call setBackgroundMaterial on Windows: it kills per-pixel alpha
  // (Hermes HUD hit this on Win11 / Electron 40).
  hudWindow.setAlwaysOnTop(true, "screen-saver");
  hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hudWindow.setSkipTaskbar(false);
  hudWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

async function captureOverlayDisplay() {
  const bounds = hudWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const size = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  };
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: size,
  });
  const match =
    sources.find((source) => String(source.display_id) === String(display.id)) || sources[0];
  if (!match) throw new Error("Could not capture the screen.");
  return match.thumbnail.toPNG().toString("base64");
}

function registerIpc() {
  ipcMain.handle("hud:ready", async () => {
    let auth = { status: "logged-out" };
    try {
      await hostReady;
      auth = await sendToHost({ op: "status" });
    } catch {
      auth = { status: "logged-out" };
    }
    return {
      config: loadConfig(),
      auth,
      platform: process.platform,
    };
  });

  ipcMain.handle("hud:save-config", (_event, next) => saveConfig(next));

  ipcMain.handle("hud:pick-workspace", async () => {
    const result = await dialog.showOpenDialog(hudWindow, {
      title: "Project folder for Cursor",
      properties: ["openDirectory"],
      defaultPath: config.workspace || os.homedir(),
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("hud:login", () => sendToHost({ op: "login" }));
  ipcMain.handle("hud:logout", () => sendToHost({ op: "logout" }));
  ipcMain.handle("hud:cancel", (_event, tabId) => sendToHost({ op: "cancel", tabId }));
  ipcMain.handle("hud:close-tab", (_event, tabId) => sendToHost({ op: "close-tab", tabId }));

  ipcMain.handle("hud:send", async (_event, payload) => {
    const text = payload && payload.text;
    const wantScreen = Boolean(payload && payload.attachScreen);
    let image;
    if (wantScreen) image = await captureOverlayDisplay();
    return sendToHost({
      op: "send",
      tabId: payload && payload.tabId,
      workspace: payload && payload.workspace,
      text,
      image,
    });
  });

  ipcMain.on("hud:focus-composer", () => {
    focusHudForTyping();
  });

  ipcMain.on("hud:ignore-mouse", (_event, ignore) => {
    if (!hudWindow || hudWindow.isDestroyed()) return;
    if (process.platform === "linux") {
      hudWindow.setIgnoreMouseEvents(false);
      return;
    }
    if (hudWindow.webContents.isFocused() && hudWindow.isFocused()) {
      if (ignore) return;
    }
    hudWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });

  ipcMain.on("hud:compact", (_event, compact) => {
    if (!hudWindow || hudWindow.isDestroyed()) return;
    saveConfig({ compact: Boolean(compact) });
    const display = screen.getDisplayMatching(hudWindow.getBounds());
    const width = hudWindow.getBounds().width;
    const height = compact ? 128 : 560;
    const x = hudWindow.getBounds().x;
    const y = display.workArea.y + display.workArea.height - height - 28;
    hudWindow.setBounds({ x, y, width, height });
  });
}

function registerHotkeys() {
  globalShortcut.register("CommandOrControl+Shift+H", () => {
    if (!hudWindow) return;
    if (hudWindow.isVisible() && hudWindow.isFocused()) {
      hudWindow.hide();
      return;
    }
    focusHudForTyping();
    emitToRenderer({ event: "focus-composer" });
  });
}

app.whenReady().then(() => {
  loadConfig();
  startHost();
  registerIpc();
  createHudWindow();
  registerHotkeys();
});

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (host) host.child.kill();
});

app.on("window-all-closed", () => {
  app.quit();
});
