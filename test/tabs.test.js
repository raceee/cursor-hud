"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { rememberRepo, createTab, nextTabTitle, normalizeTabs, workspaceName } = require("../lib/tabs");
const { normalizeConfig } = require("../lib/config");

describe("recent repos", () => {
  it("moves a repo to the front and drops duplicates", () => {
    const recent = rememberRepo(["/a", "/b", "/c"], "/b");
    assert.deepEqual(recent, ["/b", "/a", "/c"]);
  });

  it("treats trailing slashes and backslashes as the same repo", () => {
    const recent = rememberRepo(["C:\\work\\app"], "C:/work/app/");
    assert.equal(recent.length, 1);
    assert.equal(recent[0], "C:/work/app");
  });

  it("caps the list", () => {
    const many = Array.from({ length: 20 }, (_, i) => `/repo-${i}`);
    const recent = rememberRepo(many, "/fresh", 12);
    assert.equal(recent.length, 12);
    assert.equal(recent[0], "/fresh");
  });
});

describe("tabs", () => {
  it("names a second agent on the same repo distinctly", () => {
    const first = createTab("/Users/me/app", []);
    const second = createTab("/Users/me/app", [first]);
    assert.equal(first.title, "app");
    assert.equal(second.title, "app 2");
    assert.notEqual(first.id, second.id);
    assert.equal(nextTabTitle("/Users/me/other", [first, second]), "other");
  });

  it("restores saved tabs and recent repos from config", () => {
    const cfg = normalizeConfig({
      tabs: [
        { id: "tab-a", workspace: "/alpha", title: "alpha" },
        { id: "tab-b", workspace: "/beta", title: "beta" },
      ],
      activeTabId: "tab-b",
      recentWorkspaces: ["/beta", "/alpha", "/old"],
      model: "auto",
      modelParams: [{ id: "fast", value: "true" }],
    });
    assert.equal(cfg.activeTabId, "tab-b");
    assert.equal(cfg.workspace, "/beta");
    assert.equal(cfg.model, "auto");
    assert.equal(cfg.modelParams[0].id, "fast");
    assert.deepEqual(
      cfg.tabs.map((tab) => tab.workspace),
      ["/alpha", "/beta"]
    );
    assert.equal(cfg.recentWorkspaces[0], "/beta");
    assert.ok(cfg.recentWorkspaces.includes("/old"));
  });

  it("seeds a tab from a legacy workspace field", () => {
    const cfg = normalizeConfig({ workspace: "/legacy/repo" });
    assert.equal(cfg.tabs.length, 1);
    assert.equal(cfg.tabs[0].workspace, "/legacy/repo");
    assert.equal(workspaceName(cfg.tabs[0].workspace), "repo");
    assert.equal(normalizeTabs([{ workspace: "" }]).length, 0);
  });
});
