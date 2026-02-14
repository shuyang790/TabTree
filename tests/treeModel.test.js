import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSyncSnapshot,
  buildTreeFromTabs,
  createEmptyWindowTree,
  ensureValidTree,
  inferTreeFromSyncSnapshot,
  moveNode,
  normalizeGroupedTabParents,
  normalizeUrl,
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

test("buildTreeFromTabs preserves original parent for reordered same-url siblings", () => {
  const sharedUrl = "https://dup-parent.test/path?token=1";
  const tabs = [
    tab({ id: 2, index: 0, title: "Child A", url: sharedUrl }),
    tab({ id: 1, index: 1, title: "Parent", url: sharedUrl }),
    tab({ id: 3, index: 2, title: "Child B", url: sharedUrl })
  ];

  const previousTree = createEmptyWindowTree(1);
  previousTree.nodes = {
    [nodeIdFromTabId(1)]: {
      nodeId: nodeIdFromTabId(1),
      tabId: 1,
      parentNodeId: null,
      childNodeIds: [nodeIdFromTabId(2), nodeIdFromTabId(3)],
      collapsed: false,
      lastKnownTitle: "Parent",
      lastKnownUrl: sharedUrl
    },
    [nodeIdFromTabId(2)]: {
      nodeId: nodeIdFromTabId(2),
      tabId: 2,
      parentNodeId: nodeIdFromTabId(1),
      childNodeIds: [],
      collapsed: false,
      lastKnownTitle: "Child A",
      lastKnownUrl: sharedUrl
    },
    [nodeIdFromTabId(3)]: {
      nodeId: nodeIdFromTabId(3),
      tabId: 3,
      parentNodeId: nodeIdFromTabId(1),
      childNodeIds: [],
      collapsed: false,
      lastKnownTitle: "Child B",
      lastKnownUrl: sharedUrl
    }
  };
  previousTree.rootNodeIds = [nodeIdFromTabId(1)];

  const restored = buildTreeFromTabs(tabs, previousTree);

  assert.equal(restored.nodes[nodeIdFromTabId(2)].parentNodeId, nodeIdFromTabId(1));
  assert.equal(restored.nodes[nodeIdFromTabId(3)].parentNodeId, nodeIdFromTabId(1));
  assert.notEqual(restored.nodes[nodeIdFromTabId(3)].parentNodeId, nodeIdFromTabId(2));
  assert.deepEqual(restored.nodes[nodeIdFromTabId(1)].childNodeIds, [nodeIdFromTabId(2), nodeIdFromTabId(3)]);
});

test("buildTreeFromTabs falls back to title matching when urls are missing", () => {
  const tabs = [
    tab({ id: 1, index: 0, title: "Persist Parent", url: "" }),
    tab({ id: 2, index: 1, title: "Persist Child", url: "" })
  ];

  const previousTree = createEmptyWindowTree(1);
  previousTree.nodes = {
    [nodeIdFromTabId(1)]: {
      nodeId: nodeIdFromTabId(1),
      tabId: 1,
      parentNodeId: null,
      childNodeIds: [nodeIdFromTabId(2)],
      collapsed: false,
      lastKnownTitle: "Persist Parent",
      lastKnownUrl: ""
    },
    [nodeIdFromTabId(2)]: {
      nodeId: nodeIdFromTabId(2),
      tabId: 2,
      parentNodeId: nodeIdFromTabId(1),
      childNodeIds: [],
      collapsed: false,
      lastKnownTitle: "Persist Child",
      lastKnownUrl: ""
    }
  };
  previousTree.rootNodeIds = [nodeIdFromTabId(1)];

  const restored = buildTreeFromTabs(tabs, previousTree);

  assert.equal(restored.nodes[nodeIdFromTabId(2)].parentNodeId, nodeIdFromTabId(1));
  assert.deepEqual(restored.nodes[nodeIdFromTabId(1)].childNodeIds, [nodeIdFromTabId(2)]);
});

test("ensureValidTree dedupes root and child node ids while repairing missing parents", () => {
  const rootNodeId = nodeIdFromTabId(1);
  const childNodeId = nodeIdFromTabId(2);
  const staleParentNodeId = nodeIdFromTabId(999);
  const orphanNodeId = nodeIdFromTabId(3);

  const tree = createEmptyWindowTree(1);
  tree.nodes = {
    [rootNodeId]: {
      nodeId: rootNodeId,
      tabId: 1,
      parentNodeId: null,
      childNodeIds: [childNodeId, childNodeId, staleParentNodeId, rootNodeId],
      collapsed: false,
      lastKnownTitle: "Root",
      lastKnownUrl: "https://example.com/1"
    },
    [childNodeId]: {
      nodeId: childNodeId,
      tabId: 2,
      parentNodeId: rootNodeId,
      childNodeIds: [],
      collapsed: false,
      lastKnownTitle: "Child",
      lastKnownUrl: "https://example.com/2"
    },
    [orphanNodeId]: {
      nodeId: orphanNodeId,
      tabId: 3,
      parentNodeId: staleParentNodeId,
      childNodeIds: [],
      collapsed: false,
      lastKnownTitle: "Orphan",
      lastKnownUrl: "https://example.com/3"
    }
  };
  tree.rootNodeIds = [rootNodeId, rootNodeId, orphanNodeId, staleParentNodeId];

  const validated = ensureValidTree(tree);

  assert.deepEqual(validated.rootNodeIds, [rootNodeId, orphanNodeId]);
  assert.deepEqual(validated.nodes[rootNodeId].childNodeIds, [childNodeId]);
  assert.equal(validated.nodes[orphanNodeId].parentNodeId, null);
});

test("normalizeUrl strips hash and trailing slash while preserving query", () => {
  assert.equal(
    normalizeUrl("https://example.com/path/?q=1#frag"),
    "https://example.com/path?q=1"
  );
  assert.equal(normalizeUrl("not-a-url"), "not-a-url");
  assert.equal(normalizeUrl(""), "");
});

test("buildSyncSnapshot enforces window/node/url limits", () => {
  const windowA = createEmptyWindowTree(1);
  const windowB = createEmptyWindowTree(2);
  const windowC = createEmptyWindowTree(3);

  windowA.updatedAt = 100;
  windowB.updatedAt = 300;
  windowC.updatedAt = 200;

  windowB.nodes[nodeIdFromTabId(20)] = {
    nodeId: nodeIdFromTabId(20),
    tabId: 20,
    parentNodeId: null,
    childNodeIds: [nodeIdFromTabId(21), nodeIdFromTabId(22)],
    collapsed: false,
    lastKnownUrl: "https://example.com/super-long-root-url"
  };
  windowB.nodes[nodeIdFromTabId(21)] = {
    nodeId: nodeIdFromTabId(21),
    tabId: 21,
    parentNodeId: nodeIdFromTabId(20),
    childNodeIds: [],
    collapsed: true,
    lastKnownUrl: "https://example.com/child-one"
  };
  windowB.nodes[nodeIdFromTabId(22)] = {
    nodeId: nodeIdFromTabId(22),
    tabId: 22,
    parentNodeId: nodeIdFromTabId(20),
    childNodeIds: [],
    collapsed: false,
    lastKnownUrl: "https://example.com/child-two"
  };
  windowB.rootNodeIds = [nodeIdFromTabId(20)];

  const snapshot = buildSyncSnapshot(
    { 1: windowA, 2: windowB, 3: windowC },
    { maxWindows: 2, maxNodesPerWindow: 2, maxUrlLength: 20 }
  );

  assert.equal(snapshot.windows.length, 2);
  assert.deepEqual(snapshot.windows.map((entry) => entry.w), ["2", "3"]);
  assert.equal(snapshot.windows[0].n.length, 2);
  assert.ok(snapshot.windows[0].n[0].u.length <= 20);
  assert.equal(snapshot.windows[0].n[1].c, 1);
});

test("inferTreeFromSyncSnapshot returns null for missing window snapshot", () => {
  const tabs = [tab({ id: 1, url: "https://example.com/a" })];
  const inferred = inferTreeFromSyncSnapshot(99, tabs, {
    windows: [{ w: "1", n: [{ u: "https://example.com/a", p: "", c: 0 }] }]
  });
  assert.equal(inferred, null);
});

test("inferTreeFromSyncSnapshot reconstructs parent-child from snapshot urls", () => {
  const tabs = [
    tab({ id: 1, index: 0, url: "https://example.com/root" }),
    tab({ id: 2, index: 1, url: "https://example.com/child" })
  ];

  const inferred = inferTreeFromSyncSnapshot(7, tabs, {
    windows: [
      {
        w: "7",
        n: [
          { u: "https://example.com/root", p: "", c: 0 },
          { u: "https://example.com/child", p: "https://example.com/root", c: 1 }
        ]
      }
    ]
  });

  assert.ok(inferred);
  assert.equal(inferred.nodes[nodeIdFromTabId(2)].parentNodeId, nodeIdFromTabId(1));
});
