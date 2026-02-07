import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTreeFromTabs,
  createEmptyWindowTree,
  moveNode,
  nodeIdFromTabId,
  removeNodePromoteChildren,
  setActiveTab,
  sortTreeByIndex,
  upsertTabNode
} from "../shared/treeModel.js";

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

test("upsertTabNode builds roots and preserves active selection", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, index: 0 }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1, active: true }));

  assert.deepEqual(tree.rootNodeIds, [nodeIdFromTabId(1), nodeIdFromTabId(2)]);
  assert.equal(tree.selectedTabId, 2);
});

test("moveNode reparents and rejects cycle", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, index: 0 }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1 }));
  tree = upsertTabNode(tree, tab({ id: 3, index: 2 }));

  tree = moveNode(tree, nodeIdFromTabId(2), nodeIdFromTabId(1));
  tree = moveNode(tree, nodeIdFromTabId(3), nodeIdFromTabId(2));

  const attemptedCycle = moveNode(tree, nodeIdFromTabId(1), nodeIdFromTabId(3));

  assert.equal(attemptedCycle.nodes[nodeIdFromTabId(1)].parentNodeId, null);
  assert.equal(attemptedCycle.nodes[nodeIdFromTabId(2)].parentNodeId, nodeIdFromTabId(1));
  assert.equal(attemptedCycle.nodes[nodeIdFromTabId(3)].parentNodeId, nodeIdFromTabId(2));
});

test("removeNodePromoteChildren promotes to root when parent removed", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, index: 0 }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1 }));
  tree = upsertTabNode(tree, tab({ id: 3, index: 2 }));

  tree = moveNode(tree, nodeIdFromTabId(2), nodeIdFromTabId(1));
  tree = moveNode(tree, nodeIdFromTabId(3), nodeIdFromTabId(2));

  tree = removeNodePromoteChildren(tree, nodeIdFromTabId(2));

  assert.equal(tree.nodes[nodeIdFromTabId(3)].parentNodeId, nodeIdFromTabId(1));
  assert.ok(tree.nodes[nodeIdFromTabId(2)] === undefined);
});

test("buildTreeFromTabs does not infer child from opener by default", () => {
  const tabs = [
    tab({ id: 1, index: 0, url: "https://a.test" }),
    { ...tab({ id: 2, index: 1, url: "https://b.test" }), openerTabId: 1 }
  ];
  const tree = buildTreeFromTabs(tabs);

  assert.equal(tree.nodes[nodeIdFromTabId(2)].parentNodeId, null);
});

test("setActiveTab marks one active tab", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, index: 0, active: true }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1 }));

  tree = setActiveTab(tree, 2);

  assert.equal(tree.selectedTabId, 2);
  assert.equal(tree.nodes[nodeIdFromTabId(2)].active, true);
  assert.equal(tree.nodes[nodeIdFromTabId(1)].active, false);
});

test("upsertTabNode reparents existing node when parentNodeId is provided", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, index: 0 }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1 }));

  tree = upsertTabNode(tree, tab({ id: 2, index: 1 }), { parentNodeId: nodeIdFromTabId(1) });
  tree = sortTreeByIndex(tree);

  assert.equal(tree.nodes[nodeIdFromTabId(2)].parentNodeId, nodeIdFromTabId(1));
  assert.deepEqual(tree.rootNodeIds, [nodeIdFromTabId(1)]);
});
