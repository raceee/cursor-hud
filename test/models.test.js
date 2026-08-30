"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { flattenModelOptions, optionKey, findModelOption, modelSelection } = require("../lib/models");

describe("model catalog", () => {
  it("flattens variants into Cursor-style selector rows", () => {
    const options = flattenModelOptions([
      {
        id: "composer-2.5",
        displayName: "Composer 2.5",
        variants: [
          { params: [{ id: "fast", value: "true" }], displayName: "Composer 2.5", isDefault: true },
          { params: [{ id: "fast", value: "false" }], displayName: "Composer 2.5" },
        ],
      },
      { id: "auto", displayName: "Auto" },
    ]);
    assert.equal(options.length, 3);
    assert.equal(options[0].label, "Composer 2.5 Fast");
    assert.equal(options[1].label, "Composer 2.5");
    assert.equal(options[2].label, "Auto");
    assert.equal(optionKey(options[0]), "composer-2.5|fast=true");
  });

  it("finds the matching option by id and params", () => {
    const options = flattenModelOptions([
      {
        id: "composer-2.5",
        displayName: "Composer 2.5",
        variants: [
          { params: [{ id: "fast", value: "true" }], displayName: "Composer 2.5 Fast" },
          { params: [{ id: "fast", value: "false" }], displayName: "Composer 2.5" },
        ],
      },
    ]);
    const found = findModelOption(options, "composer-2.5", [{ id: "fast", value: "false" }]);
    assert.equal(found.label, "Composer 2.5");
    assert.equal(findModelOption(options, "missing", []).id, "composer-2.5");
  });

  it("always produces an explicit model for local SDK calls", () => {
    assert.deepEqual(modelSelection({}), { id: "composer-2.5" });
    assert.deepEqual(modelSelection({ model: "composer-2" }), { id: "composer-2" });
    assert.deepEqual(modelSelection({ model: "composer-2.5", modelParams: [{ id: "fast", value: "true" }] }), {
      id: "composer-2.5",
      params: [{ id: "fast", value: "true" }],
    });
  });
});
