import test from "node:test";
import assert from "node:assert/strict";
import {
  groupTabIds,
  rootBuckets
} from "../sidepanel/rootBucketsModel.js";

function sampleTree() {
  return {
    rootNodeIds: ["tab:1", "tab:2", "tab:3", "tab:4", "tab:5", "tab:6"],
    nodes: {
      "tab:1": { tabId: 1, pinned: true, groupId: null },
      "tab:2": { tabId: 2, pinned: false, groupId: 10 },
      "tab:3": { tabId: 3, pinned: false, groupId: null },
      "tab:4": { tabId: 4, pinned: false, groupId: 10 },
      "tab:5": { tabId: 5, pinned: false, groupId: 20 },
      "tab:6": { tabId: "6", pinned: false, groupId: 20 }
    }
  };
}

test("groupTabIds returns finite tab ids in a group", () => {
  const tree = sampleTree();
  assert.deepEqual(groupTabIds(tree, 10), [2, 4]);
  assert.deepEqual(groupTabIds(tree, 20), [5]);
});

test("rootBuckets keeps grouped roots as node blocks when headers are disabled", () => {
  const tree = sampleTree();
  assert.deepEqual(
    rootBuckets(tree, { showGroupHeaders: false }),
    {
      pinned: ["tab:1"],
      blocks: [
        { type: "node", rootNodeId: "tab:2" },
        { type: "node", rootNodeId: "tab:3" },
        { type: "node", rootNodeId: "tab:4" },
        { type: "node", rootNodeId: "tab:5" },
        { type: "node", rootNodeId: "tab:6" }
      ]
    }
  );
});

test("rootBuckets groups roots by tab group id when headers are enabled", () => {
  const tree = sampleTree();
  assert.deepEqual(
    rootBuckets(tree, { showGroupHeaders: true }),
    {
      pinned: ["tab:1"],
      blocks: [
        { type: "group", groupId: 10, rootNodeIds: ["tab:2", "tab:4"] },
        { type: "node", rootNodeId: "tab:3" },
        { type: "group", groupId: 20, rootNodeIds: ["tab:5", "tab:6"] }
      ]
    }
  );
});

