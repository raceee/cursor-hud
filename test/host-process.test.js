"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  isElectronBinary,
  resolveHostScript,
  resolveHostCommand,
  hostSpawnEnv,
} = require("../lib/host-process");

describe("host process launch", () => {
  it("reuses the Electron binary as Node so a packaged app does not need system Node", () => {
    const launch = resolveHostCommand({
      execPath: "/Applications/Cursor HUD.app/Contents/MacOS/Cursor HUD",
      env: {},
      versions: { electron: "37.10.3" },
    });
    assert.equal(launch.command, "/Applications/Cursor HUD.app/Contents/MacOS/Cursor HUD");
    assert.equal(launch.electronAsNode, true);
    assert.equal(isElectronBinary("/tmp/electron", {}), true);
  });

  it("honors CURSOR_HUD_NODE and uses plain Node otherwise", () => {
    assert.deepEqual(
      resolveHostCommand({
        execPath: "/usr/local/bin/node",
        env: { CURSOR_HUD_NODE: "/opt/node" },
        versions: {},
      }),
      { command: "/opt/node", electronAsNode: false }
    );
    assert.deepEqual(
      resolveHostCommand({
        execPath: "/usr/local/bin/node",
        env: {},
        versions: {},
      }),
      { command: "/usr/local/bin/node", electronAsNode: false }
    );
  });

  it("points a packaged app at the copied host script", () => {
    assert.equal(
      resolveHostScript({
        packaged: true,
        resourcesPath: "/App/Contents/Resources",
        appRoot: "/dev/cursor-hud",
      }),
      path.join("/App/Contents/Resources", "app", "host", "agent-host.js")
    );
    assert.equal(
      resolveHostScript({
        packaged: false,
        resourcesPath: "/unused",
        appRoot: "/dev/cursor-hud",
      }),
      path.join("/dev/cursor-hud", "host", "agent-host.js")
    );
  });

  it("sets ELECTRON_RUN_AS_NODE only on the host child", () => {
    const asNode = hostSpawnEnv({ ELECTRON_RUN_AS_NODE: "0", NO_OPEN_BROWSER: "1" }, { electronAsNode: true });
    assert.equal(asNode.ELECTRON_RUN_AS_NODE, "1");
    assert.equal(asNode.NO_OPEN_BROWSER, undefined);
    const plain = hostSpawnEnv({ ELECTRON_RUN_AS_NODE: "1" }, { electronAsNode: false });
    assert.equal(plain.ELECTRON_RUN_AS_NODE, undefined);
  });
});
