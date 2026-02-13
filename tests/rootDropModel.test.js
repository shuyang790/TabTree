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

test("buildRootDropPayload computes browser index for single-tab unpinned move", () => {
  const payload = buildRootDropPayload({
    tree: sampleTree(),
    draggingTabIds: [1]
  });
  assert.deepEqual(payload, {
    type: TREE_ACTIONS.MOVE_TO_ROOT,
    tabId: 1,
    browserIndex: 8
  });
});

test("buildRootDropPayload computes browser index for pinned move", () => {
  const payload = buildRootDropPayload({
    tree: sampleTree(),
    draggingTabIds: [3]
  });
  assert.deepEqual(payload, {
    type: TREE_ACTIONS.MOVE_TO_ROOT,
    tabId: 3,
    browserIndex: 5
  });
});

test("buildRootDropPayload returns null when source tab is missing", () => {
  const payload = buildRootDropPayload({
    tree: sampleTree(),
    draggingTabIds: [99]
  });
  assert.equal(payload, null);
});

