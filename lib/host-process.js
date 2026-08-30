"use strict";

const path = require("node:path");

function isElectronBinary(execPath, versions = process.versions) {
  return Boolean(versions && versions.electron) || /electron/i.test(String(execPath || ""));
}

function resolveHostScript({ packaged, resourcesPath, appRoot }) {
  if (packaged) {
    return path.join(resourcesPath, "app", "host", "agent-host.js");
  }
  return path.join(appRoot, "host", "agent-host.js");
}

function resolveHostCommand({ execPath, env = process.env, versions = process.versions }) {
  if (env.CURSOR_HUD_NODE) {
    return { command: env.CURSOR_HUD_NODE, electronAsNode: false };
  }
  if (isElectronBinary(execPath, versions)) {
    return { command: execPath, electronAsNode: true };
  }
  return { command: execPath || "node", electronAsNode: false };
}

function hostSpawnEnv(baseEnv, { electronAsNode }) {
  const env = { ...baseEnv };
  delete env.NO_OPEN_BROWSER;
  if (electronAsNode) env.ELECTRON_RUN_AS_NODE = "1";
  else delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function resolveHostLaunch({
  packaged,
  execPath,
  resourcesPath,
  appRoot,
  env = process.env,
  versions = process.versions,
}) {
  const { command, electronAsNode } = resolveHostCommand({ execPath, env, versions });
  return {
    command,
    script: resolveHostScript({ packaged, resourcesPath, appRoot }),
    env: hostSpawnEnv(env, { electronAsNode }),
    electronAsNode,
  };
}

module.exports = {
  isElectronBinary,
  resolveHostScript,
  resolveHostCommand,
  hostSpawnEnv,
  resolveHostLaunch,
};
