import test from "node:test";
import assert from "node:assert/strict";

import { pruneTreeAgainstLiveTabs, removeTabIdsFromTree } from "../background/windowTreeReconciler.js";
import { createEmptyWindowTree, moveNode, nodeIdFromTabId, setActiveTab, upsertTabNode } from "../shared/treeModel.js";

function tab(partial) {
  return {
    id: partial.id,
    windowId: partial.windowId ?? 1,
    index: partial.index ?? 0,
    active: !!partial.active,
    pinned: !!partial.pinned,
    groupId: partial.groupId ?? -1,
    title: partial.title ?? `Tab ${partial.id}`,
    url: partial.url ?? `https://example.com/${partial.id}`,
    favIconUrl: ""
  };
}

test("removeTabIdsFromTree removes stale ids and clears invalid selection", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, active: true }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1 }));

  const result = removeTabIdsFromTree(tree, [1, 1, 999]);

  assert.equal(result.changed, true);
  assert.equal(result.tree.nodes[nodeIdFromTabId(1)], undefined);
  assert.equal(result.tree.nodes[nodeIdFromTabId(2)]?.tabId, 2);
  assert.equal(result.tree.selectedTabId, null);
});

test("pruneTreeAgainstLiveTabs promotes surviving descendants and adopts active tab", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, index: 0, active: true }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1 }));
  tree = moveNode(tree, nodeIdFromTabId(2), nodeIdFromTabId(1));
  tree = setActiveTab(tree, 1);

  const result = pruneTreeAgainstLiveTabs(tree, new Set([2]), 2);

  assert.equal(result.changed, true);
  assert.equal(result.tree.nodes[nodeIdFromTabId(1)], undefined);
  assert.equal(result.tree.nodes[nodeIdFromTabId(2)]?.parentNodeId, null);
  assert.equal(result.tree.selectedTabId, 2);
  assert.deepEqual(result.tree.rootNodeIds, [nodeIdFromTabId(2)]);
});

test("pruneTreeAgainstLiveTabs drops selected tab when no valid fallback exists", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, active: true }));
  tree = setActiveTab(tree, 1);

  const result = pruneTreeAgainstLiveTabs(tree, new Set(), null);

  assert.equal(result.changed, true);
  assert.equal(result.tree.selectedTabId, null);
  assert.equal(Object.keys(result.tree.nodes).length, 0);
});

test("pruneTreeAgainstLiveTabs is a no-op when tree already matches live tabs", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, active: true }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1 }));
  tree = setActiveTab(tree, 1);

  const liveIds = new Set([1, 2]);
  const result = pruneTreeAgainstLiveTabs(tree, liveIds, 1);

  assert.equal(result.changed, false);
  assert.equal(result.tree, tree);
});
