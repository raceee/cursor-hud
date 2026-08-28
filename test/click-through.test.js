"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { hudIgnoresMouse } = require("../lib/click-through");

function el(selectorMatch) {
  return {
    closest(selector) {
      return selectorMatch.includes(selector) ? this : null;
    },
  };
}

describe("click-through", () => {
  it("ignores mouse over empty HUD chrome so the game keeps the click", () => {
    assert.equal(
      hudIgnoresMouse({
        hit: null,
        activeElement: null,
        hasFocus: false,
        forceSolid: false,
      }),
      true
    );
  });

  it("stays solid over the composer and transcript", () => {
    assert.equal(
      hudIgnoresMouse({
        hit: el("[data-hud-solid]"),
        activeElement: null,
        hasFocus: false,
        forceSolid: false,
      }),
      false
    );
  });

  it("stays solid while the prompt is focused even if the hit test misses", () => {
    assert.equal(
      hudIgnoresMouse({
        hit: null,
        activeElement: el("[data-hud-solid]"),
        hasFocus: true,
        forceSolid: false,
      }),
      false
    );
  });
});
