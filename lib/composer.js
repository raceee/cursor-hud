"use strict";

const DICTATION_INPUT_TYPES = new Set([
  "insertText",
  "insertReplacementText",
  "insertFromPaste",
  "insertFromDrop",
  "insertFromYank",
  "insertCompositionText",
  "insertFromComposition",
  "deleteContentBackward",
  "deleteContentForward",
  "deleteByCut",
  "deleteByDrag",
  "deleteCompositionText",
  "deleteWordBackward",
  "deleteWordForward",
]);

function isEditableComposer(el) {
  if (!el) return false;
  if (el.readOnly || el.disabled) return false;
  const tag = String(el.tagName || "").toUpperCase();
  return tag === "TEXTAREA" || tag === "INPUT";
}

function allowsDictationInput(event) {
  if (!event) return false;
  if (event.isComposing) return true;
  if (!event.inputType) return true;
  return DICTATION_INPUT_TYPES.has(event.inputType);
}

function shouldStealComposerKey(event) {
  if (!event) return false;
  if (event.isComposing) return false;
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) return true;
  if (event.key === "Escape") return true;
  return false;
}

module.exports = {
  DICTATION_INPUT_TYPES,
  isEditableComposer,
  allowsDictationInput,
  shouldStealComposerKey,
};
