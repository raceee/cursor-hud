"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { encodeLine, extractAssistantText } = require("../lib/protocol");
const { normalizeConfig, validateWorkspace } = require("../lib/config");
const { flattenModelOptions, optionKey } = require("../lib/models");
const { resolveModeOptions, normalizeMode } = require("../lib/modes");

function write(obj) {
  process.stdout.write(encodeLine(obj));
}

function log(...args) {
  process.stderr.write(args.map(String).join(" ") + "\n");
}

async function loadSdk() {
  try {
    return require("@cursor/sdk");
  } catch (err) {
    throw new Error(
      `Cannot load @cursor/sdk (${err.message}). Run npm install and use Node 22.13+.`
    );
  }
}

function toHudAssistantDelta(update) {
  if (!update) return null;
  if (update.type !== "text-delta" || update.text == null || update.text === "") return null;
  let text = String(update.text);
  if (text.length > 1 && text.endsWith("\n") && !text.endsWith("\n\n")) {
    text = text.slice(0, -1);
  }
  return { kind: "assistant-delta", text };
}

class AgentHost {
  constructor() {
    this.sdk = null;
    this.config = normalizeConfig({});
    this.sessions = new Map();
  }

  hud(tabId, payload) {
    write({ event: "hud", tabId, ...payload });
  }

  async init() {
    this.sdk = await loadSdk();
    write({ event: "ready", node: process.version });
    await this.emitAuth();
  }

  async emitAuth(status) {
    let next = status;
    if (!next) {
      next = { status: "logged-out" };
      try {
        next = await this.sdk.Cursor.auth.status();
      } catch (err) {
        log("auth status failed", err.message);
      }
    }
    if (process.env.CURSOR_API_KEY && next.status !== "logged-in") {
      next = { status: "logged-in", email: "CURSOR_API_KEY", source: "env" };
    }
    write({ event: "auth", ...next });
    if (next.status === "logged-in") {
      await this.emitModels().catch((err) => log("models failed", err.message));
    }
    return next;
  }

  async emitModels() {
    let models = [];
    try {
      models = await this.sdk.Cursor.models.list();
    } catch (err) {
      log("models.list failed", err.message);
    }
    const options = flattenModelOptions(models);
    write({ event: "models", options });
    return options;
  }

  async login() {
    const { Cursor } = this.sdk;
    write({ event: "login-pending" });
    const result = await Cursor.auth.login({
      apiKeyName: "Cursor HUD",
      openBrowser: (url) => write({ event: "login-url", url }),
      onLoginUrl: (url) => write({ event: "login-url", url }),
    });
    const status = {
      status: "logged-in",
      email: result.email || "signed in",
      apiKeyExpiresAtMs: result.apiKeyExpiresAtMs,
    };
    await this.emitAuth(status);
    return status;
  }

  async logout() {
    const { Cursor } = this.sdk;
    await Cursor.auth.logout();
    for (const session of this.sessions.values()) {
      this.disposeSession(session);
    }
    this.sessions.clear();
    await this.emitAuth();
  }

  configure(patch) {
    const prevModel = optionKey({
      id: this.config.model,
      params: this.config.modelParams,
    });
    const prevMode = normalizeMode(this.config.mode);
    this.config = normalizeConfig({ ...this.config, ...patch });
    const nextModel = optionKey({
      id: this.config.model,
      params: this.config.modelParams,
    });
    const nextMode = normalizeMode(this.config.mode);
    if (prevModel !== nextModel || prevMode !== nextMode) {
      for (const session of this.sessions.values()) this.disposeSession(session);
    }
    return this.config;
  }

  session(tabId) {
    const id = String(tabId || "").trim();
    if (!id) throw new Error("Missing tab.");
    let session = this.sessions.get(id);
    if (!session) {
      session = { tabId: id, workspace: "", agent: null, currentRun: null, busy: false };
      this.sessions.set(id, session);
    }
    return session;
  }

  disposeSession(session) {
    if (session.currentRun) {
      session.currentRun.cancel().catch(() => {});
      session.currentRun = null;
    }
    if (session.agent) {
      session.agent.close();
      session.agent = null;
    }
    session.busy = false;
  }

  closeTab(tabId) {
    const session = this.sessions.get(tabId);
    if (session) {
      this.disposeSession(session);
      this.sessions.delete(tabId);
    }
    return { closed: true };
  }

  async ensureAgent(tabId, workspace) {
    const folder = String(workspace || "").trim();
    const workspaceError = validateWorkspace(folder);
    if (workspaceError) throw new Error(workspaceError);
    if (!fs.existsSync(folder)) throw new Error(`Workspace does not exist: ${folder}`);

    const session = this.session(tabId);
    if (
      session.agent &&
      session.workspace &&
      path.resolve(session.workspace) === path.resolve(folder)
    ) {
      return session;
    }
    this.disposeSession(session);
    session.workspace = folder;
    const { Agent } = this.sdk;
    const model = { id: this.config.model || "composer-2.5" };
    if (this.config.modelParams && this.config.modelParams.length) {
      model.params = this.config.modelParams;
    }
    const mode = resolveModeOptions(this.config.mode);
    const createOptions = {
      model,
      mode: mode.sdkMode,
      local: { cwd: path.resolve(folder) },
    };
    if (mode.tools) createOptions.tools = mode.tools;
    if (mode.disallowedTools) createOptions.disallowedTools = mode.disallowedTools;
    session.agent = await Agent.create(createOptions);
    write({ event: "agent", tabId, agentId: session.agent.agentId, workspace: folder });
    return session;
  }

  async send({ tabId, text, image, workspace }) {
    const session = this.session(tabId);
    if (session.busy) throw new Error("This tab is already running a prompt.");
    const prompt = String(text || "").trim();
    if (!prompt) throw new Error("Type a prompt first.");

    await this.ensureAgent(tabId, workspace || session.workspace);
    session.busy = true;
    this.hud(tabId, { kind: "user", text: prompt });
    this.hud(tabId, { kind: "assistant-start" });

    const payload = image
      ? { text: prompt, images: [{ data: image, mimeType: "image/png" }] }
      : prompt;

    try {
      let sawTextDelta = false;
      const mode = resolveModeOptions(this.config.mode);
      const run = await session.agent.send(payload, {
        mode: mode.sdkMode,
        onDelta: ({ update }) => {
          const hud = toHudAssistantDelta(update);
          if (hud) {
            sawTextDelta = true;
            this.hud(tabId, hud);
          }
        },
      });
      session.currentRun = run;

      for await (const event of run.stream()) {
        if (event.type === "tool_call") {
          this.hud(tabId, {
            kind: "tool",
            call_id: event.call_id,
            name: event.name,
            status: event.status,
          });
        } else if (event.type === "assistant") {
          if (sawTextDelta) continue;
          const chunk = extractAssistantText(event);
          if (chunk) this.hud(tabId, { kind: "assistant-delta", text: chunk });
        } else if (event.type === "status") {
          this.hud(tabId, { kind: "status", status: String(event.status).toLowerCase() });
        } else if (event.type === "thinking") {
          this.hud(tabId, { kind: "status", status: "thinking" });
        }
      }

      const result = await run.wait();
      this.hud(tabId, { kind: "done", result: result.result || "", status: result.status });
      return { status: result.status, tabId };
    } catch (err) {
      this.hud(tabId, { kind: "error", message: err.message || String(err) });
      throw err;
    } finally {
      session.busy = false;
      session.currentRun = null;
    }
  }

  async cancel(tabId) {
    const session = tabId ? this.sessions.get(tabId) : null;
    if (session && session.currentRun) {
      await session.currentRun.cancel();
      return { cancelled: true, tabId };
    }
    return { cancelled: false, tabId: tabId || null };
  }
}

async function main() {
  const host = new AgentHost();
  await host.init();

  const { createNdjsonParser } = require("../lib/protocol");
  let queue = Promise.resolve();
  const parse = createNdjsonParser((msg) => {
    queue = queue.then(async () => {
      if (!msg || typeof msg !== "object" || msg.id == null) return;
      const { id, op } = msg;
      try {
        if (op === "send") {
          host
            .send({
              tabId: msg.tabId,
              text: msg.text,
              image: msg.image,
              workspace: msg.workspace,
            })
            .then((result) => write({ id, ok: true, result }))
            .catch((err) => write({ id, ok: false, error: err.message || String(err) }));
          return;
        }
        let result;
        if (op === "status") result = await host.emitAuth();
        else if (op === "login") result = await host.login();
        else if (op === "logout") result = await host.logout();
        else if (op === "models") result = await host.emitModels();
        else if (op === "configure") result = host.configure(msg.config || {});
        else if (op === "cancel") result = await host.cancel(msg.tabId);
        else if (op === "close-tab") result = host.closeTab(msg.tabId);
        else throw new Error(`Unknown op: ${op}`);
        write({ id, ok: true, result });
      } catch (err) {
        write({ id, ok: false, error: err.message || String(err) });
      }
    });
  });

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", parse);
  process.stdin.on("end", () => {
    queue.then(() => process.exit(0));
  });
}

main().catch((err) => {
  write({ event: "hud", kind: "error", message: err.message || String(err) });
  process.exit(1);
});
