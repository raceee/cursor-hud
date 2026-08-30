"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { encodeLine, extractAssistantText } = require("../lib/protocol");
const { normalizeConfig, validateWorkspace } = require("../lib/config");
const { flattenModelOptions, optionKey, modelSelection } = require("../lib/models");
const { resolveModeOptions, normalizeMode } = require("../lib/modes");
const { toHudDelta, pickDetail, extractPlanMarkdown, planMarkdownFromDelta } = require("../lib/activity");
const { createTracer } = require("../lib/trace");
const { attachHistory } = require("../lib/context");

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

class AgentHost {
  constructor() {
    this.sdk = null;
    this.config = normalizeConfig({});
    this.sessions = new Map();
    this.tracer = createTracer({
      enabled: this.config.debug,
      dir: this.config.debugDir || path.join(process.cwd(), "debug"),
    });
  }

  hud(tabId, payload) {
    const event = { event: "hud", tabId, ...payload };
    const kind = payload && payload.kind;
    if (kind !== "assistant-delta" && kind !== "thinking-delta") {
      this.tracer.append({ source: "host", tabId, kind, ...payload });
    }
    write(event);
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
    if (prevModel !== nextModel) {
      for (const session of this.sessions.values()) {
        this.disposeSession(session);
        session.agentId = "";
      }
    }
    this.tracer.configure({
      enabled: this.config.debug,
      dir: this.config.debugDir || path.join(process.cwd(), "debug"),
    });
    if (prevMode !== nextMode) {
      this.tracer.append({ source: "host", kind: "mode", from: prevMode, to: nextMode });
    }
    return this.config;
  }

  session(tabId) {
    const id = String(tabId || "").trim();
    if (!id) throw new Error("Missing tab.");
    let session = this.sessions.get(id);
    if (!session) {
      session = {
        tabId: id,
        workspace: "",
        mode: "",
        agentId: "",
        agent: null,
        currentRun: null,
        busy: false,
        cancelRequested: false,
      };
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
    session.cancelRequested = false;
  }

  closeTab(tabId) {
    const session = this.sessions.get(tabId);
    if (session) {
      this.disposeSession(session);
      this.sessions.delete(tabId);
    }
    return { closed: true };
  }

  rememberAgent(session, tabId, folder) {
    session.agentId = session.agent && session.agent.agentId ? session.agent.agentId : session.agentId || "";
    if (session.agentId) {
      write({ event: "agent", tabId, agentId: session.agentId, workspace: folder });
    }
  }

  async ensureAgent(tabId, workspace, requestedMode, extras) {
    const folder = String(workspace || "").trim();
    const workspaceError = validateWorkspace(folder);
    if (workspaceError) throw new Error(workspaceError);
    if (!fs.existsSync(folder)) throw new Error(`Workspace does not exist: ${folder}`);

    const session = this.session(tabId);
    const wantedMode = normalizeMode(requestedMode || this.config.mode);
    const hintedId = String((extras && extras.agentId) || session.agentId || "").trim();
    if (
      session.agent &&
      session.workspace &&
      path.resolve(session.workspace) === path.resolve(folder)
    ) {
      session.mode = wantedMode;
      return { session, fresh: false };
    }

    this.disposeSession(session);
    session.workspace = folder;
    session.mode = wantedMode;
    session.agentId = hintedId;
    const { Agent } = this.sdk;
    const cwd = path.resolve(folder);

    const model = modelSelection(this.config);
    if (hintedId) {
      try {
        session.agent = await Agent.resume(hintedId, { model, local: { cwd } });
        this.rememberAgent(session, tabId, folder);
        this.tracer.append({ source: "host", kind: "resume", tabId, agentId: hintedId, model: model.id });
        return { session, fresh: false };
      } catch (err) {
        log("resume failed", err.message);
        this.tracer.append({
          source: "host",
          kind: "resume-failed",
          tabId,
          agentId: hintedId,
          message: err.message || String(err),
        });
      }
    }

    session.agent = await Agent.create({
      model,
      local: { cwd },
    });
    this.rememberAgent(session, tabId, folder);
    this.tracer.append({ source: "host", kind: "create", tabId, agentId: session.agentId });
    return { session, fresh: true };
  }

  async send({ tabId, text, image, workspace, mode, agentId, messages }) {
    const session = this.session(tabId);
    if (session.busy) throw new Error("This tab is already running a prompt.");
    const prompt = String(text || "").trim();
    if (!prompt) throw new Error("Type a prompt first.");

    const wantedMode = normalizeMode(mode || this.config.mode);
    this.tracer.append({
      source: "host",
      kind: "send",
      tabId,
      mode: wantedMode,
      workspace: workspace || session.workspace,
      text: prompt,
    });
    const { fresh } = await this.ensureAgent(tabId, workspace || session.workspace, wantedMode, {
      agentId,
    });
    const outbound = fresh ? attachHistory(messages, prompt) : prompt;
    session.busy = true;
    session.cancelRequested = false;
    this.hud(tabId, { kind: "user", text: prompt });
    this.hud(tabId, { kind: "assistant-start" });

    const payload = image
      ? { text: outbound, images: [{ data: image, mimeType: "image/png" }] }
      : outbound;

    try {
      let sawTextDelta = false;
      const modeOptions = resolveModeOptions(wantedMode);
      const sendOptions = {
        model: modelSelection(this.config),
        mode: modeOptions.sdkMode,
        onDelta: ({ update }) => {
          const hud = toHudDelta(update);
          if (hud) {
            if (hud.kind === "assistant-delta") sawTextDelta = true;
            this.hud(tabId, hud);
          }
          const plan = planMarkdownFromDelta(update);
          if (plan) {
            sawTextDelta = true;
            this.hud(tabId, { kind: "assistant-delta", text: plan });
          }
        },
      };
      if (modeOptions.tools) sendOptions.tools = modeOptions.tools;
      if (modeOptions.disallowedTools) sendOptions.disallowedTools = modeOptions.disallowedTools;
      const run = await session.agent.send(payload, sendOptions);
      session.currentRun = run;
      if (session.cancelRequested) {
        await run.cancel();
        this.hud(tabId, { kind: "done", status: "cancelled" });
        return { status: "cancelled", tabId };
      }

      for await (const event of run.stream()) {
        if (event.type === "tool_call") {
          this.hud(tabId, {
            kind: "tool",
            call_id: event.call_id,
            name: event.name,
            status: event.status,
            detail: pickDetail(event.args),
          });
          const plan = extractPlanMarkdown(event.name, event.args);
          if (plan) {
            sawTextDelta = true;
            this.hud(tabId, { kind: "assistant-delta", text: plan });
          }
        } else if (event.type === "assistant") {
          if (sawTextDelta) continue;
          const chunk = extractAssistantText(event);
          if (chunk) this.hud(tabId, { kind: "assistant-delta", text: chunk });
        } else if (event.type === "status") {
          this.hud(tabId, { kind: "status", status: String(event.status).toLowerCase() });
        } else if (event.type === "thinking") {
          if (event.text) this.hud(tabId, { kind: "thinking-delta", text: String(event.text) });
          else this.hud(tabId, { kind: "status", status: "thinking" });
        }
      }

      const result = await run.wait();
      this.hud(tabId, { kind: "done", result: result.result || "", status: result.status });
      return { status: result.status, tabId };
    } catch (err) {
      if (session.cancelRequested || /cancel/i.test(err.message || "")) {
        this.hud(tabId, { kind: "done", status: "cancelled" });
        return { status: "cancelled", tabId };
      }
      this.hud(tabId, { kind: "error", message: err.message || String(err) });
      throw err;
    } finally {
      session.busy = false;
      session.currentRun = null;
      session.cancelRequested = false;
    }
  }

  async cancel(tabId) {
    const session = tabId ? this.sessions.get(tabId) : null;
    if (!session) return { cancelled: false, tabId: tabId || null };
    session.cancelRequested = true;
    if (session.currentRun) {
      await session.currentRun.cancel();
      return { cancelled: true, tabId };
    }
    return { cancelled: Boolean(session.busy), tabId: tabId || null };
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
              mode: msg.mode,
              agentId: msg.agentId,
              messages: msg.messages,
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
