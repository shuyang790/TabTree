import test from "node:test";
import assert from "node:assert/strict";
import { dedupeRootNodeIds, subtreeTabIds } from "../shared/treeUtils.js";

function sampleTree() {
  return {
    nodes: {
      "tab:1": { parentNodeId: null, childNodeIds: ["tab:2", "tab:3"], tabId: 1 },
      "tab:2": { parentNodeId: "tab:1", childNodeIds: ["tab:4"], tabId: 2 },
      "tab:3": { parentNodeId: "tab:1", childNodeIds: [], tabId: 3 },
      "tab:4": { parentNodeId: "tab:2", childNodeIds: [], tabId: 4 }
    }
  };
}

test("dedupeRootNodeIds removes descendants when ancestor is included", () => {
  const tree = sampleTree();
  const deduped = dedupeRootNodeIds(tree, ["tab:2", "tab:1", "tab:4", "tab:3"]);
  assert.deepEqual(deduped, ["tab:1"]);
});

test("subtreeTabIds returns all tab ids in subtree traversal order", () => {
  const tree = sampleTree();
  const ids = subtreeTabIds(tree, "tab:1");
  assert.deepEqual(ids, [1, 3, 2, 4]);
});
