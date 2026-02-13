import test from "node:test";
import assert from "node:assert/strict";
import { TREE_ACTIONS } from "../shared/constants.js";
import { buildDropPayload, canDrop } from "../sidepanel/dropModel.js";

function nodeIdFromTabId(tabId) {
  return `tab:${tabId}`;
}

function isDescendant(tree, ancestorNodeId, maybeDescendantNodeId) {
  if (!ancestorNodeId || !maybeDescendantNodeId) {
    return false;
  }
  const stack = [...(tree.nodes[ancestorNodeId]?.childNodeIds || [])];
  while (stack.length) {
    const current = stack.pop();
    if (current === maybeDescendantNodeId) {
      return true;
    }
    stack.push(...(tree.nodes[current]?.childNodeIds || []));
  }
  return false;
}

function subtreeMaxIndex(tree, rootNodeId) {
  let max = tree.nodes[rootNodeId]?.index ?? 0;
  const stack = [...(tree.nodes[rootNodeId]?.childNodeIds || [])];
  while (stack.length) {
    const current = stack.pop();
    const node = tree.nodes[current];
    if (!node) {
      continue;
    }
    max = Math.max(max, node.index);
    stack.push(...node.childNodeIds);
  }
  return max;
}

function sampleTree() {
  return {
    rootNodeIds: ["tab:1", "tab:2", "tab:3"],
    nodes: {
      "tab:1": { tabId: 1, index: 0, parentNodeId: null, pinned: false, childNodeIds: [] },
      "tab:2": { tabId: 2, index: 1, parentNodeId: null, pinned: false, childNodeIds: ["tab:4"] },
      "tab:3": { tabId: 3, index: 2, parentNodeId: null, pinned: false, childNodeIds: [] },
      "tab:4": { tabId: 4, index: 3, parentNodeId: "tab:2", pinned: false, childNodeIds: [] },
      "tab:5": { tabId: 5, index: 0, parentNodeId: null, pinned: true, childNodeIds: [] }
    }
  };
}

test("canDrop rejects cycles and pinned mismatches", () => {
  const tree = sampleTree();

  const cycle = canDrop({
    tree,
    sourceTabIds: [2],
    targetTabId: 4,
    position: "inside",
    nodeIdFromTabId,
    isDescendant
  });
  assert.equal(cycle, false);

  const pinnedMismatch = canDrop({
    tree,
    sourceTabIds: [5],
    targetTabId: 2,
    position: "inside",
    nodeIdFromTabId,
    isDescendant
  });
  assert.equal(pinnedMismatch, false);
});

test("canDrop accepts valid before/after root moves", () => {
  const tree = sampleTree();
  const valid = canDrop({
    tree,
    sourceTabIds: [1],
    targetTabId: 3,
    position: "after",
    nodeIdFromTabId,
    isDescendant
  });
  assert.equal(valid, true);
});

test("buildDropPayload returns batch root payload for multi-select root placement", () => {
  const tree = sampleTree();
  const payload = buildDropPayload({
    tree,
    sourceTabIds: [1, 3],
    targetTabId: 2,
    position: "after",
    nodeIdFromTabId,
    subtreeMaxIndex
  });

  assert.deepEqual(payload, {
    type: TREE_ACTIONS.BATCH_MOVE_TO_ROOT,
    tabIds: [1, 3],
    targetTabId: 2,
    placement: "after"
  });
});

test("buildDropPayload returns single-tab inside reparent payload", () => {
  const tree = sampleTree();
  const payload = buildDropPayload({
    tree,
    sourceTabIds: [3],
    targetTabId: 2,
    position: "inside",
    nodeIdFromTabId,
    subtreeMaxIndex
  });

  assert.deepEqual(payload, {
    type: TREE_ACTIONS.REPARENT_TAB,
    tabId: 3,
    targetTabId: 2,
    newParentTabId: 2,
    newIndex: 1,
    browserIndex: 4
  });
});

test("dropModel works with default helper dependencies", () => {
  const tree = sampleTree();
  const valid = canDrop({
    tree,
    sourceTabIds: [1],
    targetTabId: 3,
    position: "after"
  });
  assert.equal(valid, true);

  const payload = buildDropPayload({
    tree,
    sourceTabIds: [1],
    targetTabId: 3,
    position: "after"
  });
  assert.deepEqual(payload, {
    type: TREE_ACTIONS.MOVE_TO_ROOT,
    tabId: 1,
    index: 2,
    browserIndex: 3
  });
});
