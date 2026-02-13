import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConfirmDialogState,
  confirmSkipPatch,
  nextFocusWrapIndex
} from "../sidepanel/confirmCloseModel.js";

test("buildConfirmDialogState preserves close action metadata and message", () => {
  const action = { kind: "batch-tabs", tabIds: [1, 2] };
  const fakeButton = {};
  const state = buildConfirmDialogState({
    action,
    isBatch: true,
    totalTabs: 2,
    activeElement: fakeButton,
    formatMessage: (count) => `Close ${count}?`
  });

  assert.deepEqual(state, {
    pendingCloseAction: { action, isBatch: true },
    confirmReturnFocusEl: fakeButton,
    message: "Close 2?"
  });
});

test("confirmSkipPatch disables matching confirmation key when checked", () => {
  assert.deepEqual(confirmSkipPatch({ isBatch: true }, true), { confirmCloseBatch: false });
  assert.deepEqual(confirmSkipPatch({ isBatch: false }, true), { confirmCloseSubtree: false });
  assert.equal(confirmSkipPatch({ isBatch: true }, false), null);
  assert.equal(confirmSkipPatch(null, true), null);
});

test("nextFocusWrapIndex wraps focus in both directions", () => {
  assert.equal(nextFocusWrapIndex(0, 3, false), 1);
  assert.equal(nextFocusWrapIndex(2, 3, false), 0);
  assert.equal(nextFocusWrapIndex(0, 3, true), 2);
  assert.equal(nextFocusWrapIndex(-1, 3, false), 0);
  assert.equal(nextFocusWrapIndex(0, 0, false), -1);
});

