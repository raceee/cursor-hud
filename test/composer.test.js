"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  isEditableComposer,
  allowsDictationInput,
  shouldStealComposerKey,
} = require("../lib/composer");

describe("composer dictation", () => {
  it("treats a live textarea as an editable composer", () => {
    assert.equal(isEditableComposer({ tagName: "TEXTAREA", readOnly: false, disabled: false }), true);
    assert.equal(isEditableComposer({ tagName: "TEXTAREA", readOnly: true, disabled: false }), false);
    assert.equal(isEditableComposer({ tagName: "DIV" }), false);
  });

  it("allows typed, pasted, and IME/dictation insertion events", () => {
    assert.equal(allowsDictationInput({ inputType: "insertText" }), true);
    assert.equal(allowsDictationInput({ inputType: "insertFromPaste" }), true);
    assert.equal(allowsDictationInput({ inputType: "insertCompositionText", isComposing: true }), true);
    assert.equal(allowsDictationInput({ inputType: "insertReplacementText" }), true);
    assert.equal(allowsDictationInput({ isComposing: true }), true);
  });

  it("only steals Ctrl/Cmd+Enter and Escape, never composition keys", () => {
    assert.equal(shouldStealComposerKey({ key: "Enter", ctrlKey: true, metaKey: false }), true);
    assert.equal(shouldStealComposerKey({ key: "Enter", ctrlKey: false, metaKey: true }), true);
    assert.equal(shouldStealComposerKey({ key: "Enter", ctrlKey: false, metaKey: false }), false);
    assert.equal(shouldStealComposerKey({ key: "a", ctrlKey: false, metaKey: false }), false);
    assert.equal(shouldStealComposerKey({ key: "Enter", ctrlKey: true, isComposing: true }), false);
  });
});
