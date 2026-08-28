"use strict";

// Cursor (and other Electron hosts) export ELECTRON_RUN_AS_NODE into nested
// terminals. If that leaks into this process, `electron .` runs as Node and
// `require("electron").app` is undefined.
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require("node:child_process");
const electronPath = require("electron");

const child = spawn(electronPath, [".", ...process.argv.slice(2)], {
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
