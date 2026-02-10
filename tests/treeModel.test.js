import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTreeFromTabs,
  createEmptyWindowTree,
  moveNode,
  normalizeGroupedTabParents,
  nodeIdFromTabId,
  reconcileSelectedTabId,
  removeNodePromoteChildren,
  removeSubtree,
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

test("normalizeGroupedTabParents detaches grouped child from non-group parent", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, index: 0, groupId: -1 }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1, groupId: 7 }));
  tree = moveNode(tree, nodeIdFromTabId(2), nodeIdFromTabId(1));

  tree = normalizeGroupedTabParents(tree);

  assert.equal(tree.nodes[nodeIdFromTabId(2)].parentNodeId, null);
  assert.deepEqual(tree.rootNodeIds, [nodeIdFromTabId(1), nodeIdFromTabId(2)]);
});

test("normalizeGroupedTabParents keeps grouped child when parent is same group", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, index: 0, groupId: 5 }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1, groupId: 5 }));
  tree = moveNode(tree, nodeIdFromTabId(2), nodeIdFromTabId(1));

  tree = normalizeGroupedTabParents(tree);

  assert.equal(tree.nodes[nodeIdFromTabId(2)].parentNodeId, nodeIdFromTabId(1));
  assert.deepEqual(tree.rootNodeIds, [nodeIdFromTabId(1)]);
  assert.deepEqual(tree.nodes[nodeIdFromTabId(1)].childNodeIds, [nodeIdFromTabId(2)]);
});

test("normalizeGroupedTabParents keeps grouped subtree intact after boundary detach", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, index: 0, groupId: -1 }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1, groupId: 9 }));
  tree = upsertTabNode(tree, tab({ id: 3, index: 2, groupId: 9 }));

  tree = moveNode(tree, nodeIdFromTabId(2), nodeIdFromTabId(1));
  tree = moveNode(tree, nodeIdFromTabId(3), nodeIdFromTabId(2));
  tree = normalizeGroupedTabParents(tree);

  assert.equal(tree.nodes[nodeIdFromTabId(2)].parentNodeId, null);
  assert.equal(tree.nodes[nodeIdFromTabId(3)].parentNodeId, nodeIdFromTabId(2));
  assert.deepEqual(tree.nodes[nodeIdFromTabId(2)].childNodeIds, [nodeIdFromTabId(3)]);
});

test("removeNodePromoteChildren clears stale selected tab", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, index: 0, active: true }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1 }));

  tree = removeNodePromoteChildren(tree, nodeIdFromTabId(1));

  assert.equal(tree.selectedTabId, null);
});

test("removeSubtree clears selection when selected tab is removed", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, index: 0 }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1, active: true }));
  tree = moveNode(tree, nodeIdFromTabId(2), nodeIdFromTabId(1));

  const removed = removeSubtree(tree, nodeIdFromTabId(1));

  assert.equal(removed.tree.selectedTabId, null);
  assert.deepEqual(removed.removedTabIds.sort((a, b) => a - b), [1, 2]);
});

test("reconcileSelectedTabId prefers active fallback when valid", () => {
  let tree = createEmptyWindowTree(1);
  tree = upsertTabNode(tree, tab({ id: 1, index: 0 }));
  tree = upsertTabNode(tree, tab({ id: 2, index: 1 }));
  tree = setActiveTab(tree, 1);
  tree = removeNodePromoteChildren(tree, nodeIdFromTabId(1));

  const reconciled = reconcileSelectedTabId(tree, 2);
  assert.equal(reconciled.selectedTabId, 2);
});

test("buildTreeFromTabs handles large duplicate-url snapshots without self-parent cycles", () => {
  const tabCount = 800;
  const tabs = Array.from({ length: tabCount }, (_, idx) =>
    tab({
      id: idx + 1,
      index: idx,
      url: `https://dup.test/${idx % 10}`
    })
  );

  const previousTree = createEmptyWindowTree(1);
  previousTree.nodes = {};
  previousTree.rootNodeIds = [];
  for (let idx = 0; idx < tabCount; idx += 1) {
    const currentId = nodeIdFromTabId(idx + 1);
    const parentNodeId = idx > 0 ? nodeIdFromTabId(idx) : null;
    previousTree.nodes[currentId] = {
      nodeId: currentId,
      tabId: idx + 1,
      parentNodeId,
      childNodeIds: [],
      collapsed: idx % 7 === 0,
      lastKnownUrl: `https://dup.test/${idx % 10}`
    };
    previousTree.rootNodeIds.push(currentId);
    if (parentNodeId && previousTree.nodes[parentNodeId]) {
      previousTree.nodes[parentNodeId].childNodeIds.push(currentId);
    }
  }

  const tree = buildTreeFromTabs(tabs, previousTree);

  assert.equal(Object.keys(tree.nodes).length, tabCount);
  for (const node of Object.values(tree.nodes)) {
    assert.notEqual(node.parentNodeId, node.nodeId);
  }
});
