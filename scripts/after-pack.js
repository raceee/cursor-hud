"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

// Apple Silicon refuses to launch an Electron app that is not signed at all.
// When no Developer ID is present, ad-hoc sign the bundle before it is zipped.
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
};
