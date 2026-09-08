import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTreeFromTabs,
  moveNode,
  replaceTabNode,
  toggleNodeCollapsed,
  upsertTabNode
} from "../shared/treeModel.js";

function tab(id, overrides = {}) {
  return {
    id, windowId: 1, index: id - 1, active: false, pinned: false,
    groupId: -1, title: `Tab ${id}`, url: `https://example.com/${id}`,
    ...overrides
  };
}

function nestedTree() {
  let tree = buildTreeFromTabs([tab(1), tab(2, { active: true }), tab(3), tab(4)]);
  tree = moveNode(tree, "tab:2", "tab:1");
  tree = moveNode(tree, "tab:3", "tab:2");
  return toggleNodeCollapsed(tree, "tab:2");
}

function assertUniqueMembership(tree) {
  const memberships = [...tree.rootNodeIds, ...Object.values(tree.nodes).flatMap((node) => node.childNodeIds)];
  assert.equal(new Set(memberships).size, memberships.length);
  assert.deepEqual([...memberships].sort(), Object.keys(tree.nodes).sort());
  for (const node of Object.values(tree.nodes)) {
    const siblings = node.parentNodeId ? tree.nodes[node.parentNodeId].childNodeIds : tree.rootNodeIds;
    assert.ok(siblings.includes(node.nodeId));
  }
}

test("replaceTabNode transfers hierarchy, collapse state, selection and metadata without mutating its input", () => {
  const tree = nestedTree();
  const before = structuredClone(tree);
  const next = replaceTabNode(tree, 2, tab(22, { index: 1, active: true, title: "Replacement" }));

  assert.equal(next.nodes["tab:2"], undefined);
  assert.deepEqual(next.rootNodeIds, ["tab:1", "tab:4"]);
  assert.deepEqual(next.nodes["tab:1"].childNodeIds, ["tab:22"]);
  assert.deepEqual(next.nodes["tab:22"].childNodeIds, ["tab:3"]);
  assert.equal(next.nodes["tab:3"].parentNodeId, "tab:22");
  assert.equal(next.nodes["tab:22"].parentNodeId, "tab:1");
  assert.equal(next.nodes["tab:22"].collapsed, true);
  assert.equal(next.nodes["tab:22"].createdAt, tree.nodes["tab:2"].createdAt);
  assert.equal(next.nodes["tab:22"].lastKnownTitle, "Replacement");
  assert.equal(next.selectedTabId, 22);
  assertUniqueMembership(next);
  assert.deepEqual(tree, before);
});

test("replaceTabNode merges a replacement already inserted by an update and keeps its children", () => {
  let tree = nestedTree();
  tree = upsertTabNode(tree, tab(22, { index: 1 }));
  tree = upsertTabNode(tree, tab(23, { index: 3 }), { parentNodeId: "tab:22" });
  const next = replaceTabNode(tree, 2, tab(22, { index: 1 }));

  assert.equal(next.nodes["tab:22"].parentNodeId, "tab:1");
  assert.equal(next.nodes["tab:22"].collapsed, true);
  assert.deepEqual(next.nodes["tab:22"].childNodeIds, ["tab:3", "tab:23"]);
  assert.equal(next.nodes["tab:23"].parentNodeId, "tab:22");
  assertUniqueMembership(next);
});

test("replaceTabNode preserves a pinned root's position and does not steal inactive selection", () => {
  const tree = buildTreeFromTabs([tab(1, { pinned: true }), tab(2, { pinned: true }), tab(3, { active: true })]);
  const next = replaceTabNode(tree, 2, tab(22, { index: 1, pinned: true }));
  assert.deepEqual(next.rootNodeIds, ["tab:1", "tab:22", "tab:3"]);
  assert.equal(next.nodes["tab:22"].pinned, true);
  assert.equal(next.selectedTabId, 3);
  assertUniqueMembership(next);
});

test("replaceTabNode retains group membership and group collapse metadata", () => {
  let tree = buildTreeFromTabs([tab(1, { groupId: 7 }), tab(2, { groupId: 7 })]);
  tree = moveNode(tree, "tab:2", "tab:1");
  tree.groups[7] = { id: 7, title: "Work", color: "blue", collapsed: true };
  const next = replaceTabNode(tree, 1, tab(11, { index: 0, groupId: 7 }));
  assert.equal(next.nodes["tab:11"].groupId, 7);
  assert.equal(next.nodes["tab:2"].parentNodeId, "tab:11");
  assert.deepEqual(next.groups, tree.groups);
  assertUniqueMembership(next);
});

test("replaceTabNode is safe when the old ID is missing, unchanged, or the event is repeated", () => {
  const tree = nestedTree();
  const replacement = tab(22, { index: 1, active: true });
  const once = replaceTabNode(tree, 2, replacement);
  for (const next of [
    replaceTabNode(once, 2, replacement),
    replaceTabNode(once, 22, replacement)
  ]) {
    assert.equal(next.nodes["tab:22"].collapsed, true);
    assert.equal(next.nodes["tab:22"].parentNodeId, "tab:1");
    assert.deepEqual(next.nodes["tab:22"].childNodeIds, ["tab:3"]);
    assertUniqueMembership(next);
  }
  assertUniqueMembership(replaceTabNode(tree, 999, tab(9)));
});

test("replaceTabNode does not create a self-cycle if the replacement was attached beneath the old node", () => {
  const tree = upsertTabNode(nestedTree(), tab(22, { index: 1 }), { parentNodeId: "tab:2" });
  const next = replaceTabNode(tree, 2, tab(22, { index: 1 }));
  assert.deepEqual(next.nodes["tab:22"].childNodeIds, ["tab:3"]);
  assertUniqueMembership(next);
});
