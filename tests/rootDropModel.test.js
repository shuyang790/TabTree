import test from "node:test";
import assert from "node:assert/strict";
import { TREE_ACTIONS } from "../shared/constants.js";
import { buildRootDropPayload } from "../sidepanel/rootDropModel.js";

function sampleTree() {
  return {
    nodes: {
      "tab:1": { tabId: 1, pinned: false, index: 2 },
      "tab:2": { tabId: 2, pinned: false, index: 7 },
      "tab:3": { tabId: 3, pinned: true, index: 1 },
      "tab:4": { tabId: 4, pinned: true, index: 4 }
    }
  };
}

test("buildRootDropPayload returns batch payload for multi-selection", () => {
  const payload = buildRootDropPayload({
    tree: sampleTree(),
    draggingTabIds: [1, 2]
  });
  assert.deepEqual(payload, {
    type: TREE_ACTIONS.BATCH_MOVE_TO_ROOT,
    tabIds: [1, 2]
  });
});

test("buildRootDropPayload uses subtree blocks for a single unpinned tab", () => {
  const payload = buildRootDropPayload({
    tree: sampleTree(),
    draggingTabIds: [1]
  });
  assert.deepEqual(payload, {
    type: TREE_ACTIONS.BATCH_MOVE_TO_ROOT,
    tabIds: [1]
  });
});

test("buildRootDropPayload uses subtree blocks for a pinned tab", () => {
  const payload = buildRootDropPayload({
    tree: sampleTree(),
    draggingTabIds: [3]
  });
  assert.deepEqual(payload, {
    type: TREE_ACTIONS.BATCH_MOVE_TO_ROOT,
    tabIds: [3]
  });
});

test("buildRootDropPayload returns null when source tab is missing", () => {
  const payload = buildRootDropPayload({
    tree: sampleTree(),
    draggingTabIds: [99]
  });
  assert.equal(payload, null);
});

