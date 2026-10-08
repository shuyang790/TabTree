import { TREE_ACTIONS } from "../shared/constants.js";

function defaultNodeIdFromTabId(tabId) {
  return `tab:${tabId}`;
}

function defaultIsDescendant(tree, ancestorNodeId, maybeDescendantNodeId) {
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

export const DROP_BLOCK_REASONS = Object.freeze({
  INVALID_CONTEXT: "invalid-context",
  MISSING_TARGET: "missing-target",
  SELF_TARGET: "self-target",
  MISSING_SOURCE: "missing-source",
  CYCLE: "cycle",
  PINNED_MISMATCH: "pinned-mismatch",
  GROUP_BOUNDARY: "group-boundary"
});

function normalizedGroupId(node) {
  return Number.isInteger(node?.groupId) && node.groupId >= 0 ? node.groupId : null;
}

export function dropBlockReason({
  tree,
  sourceTabIds,
  targetTabId,
  position,
  nodeIdFromTabId = defaultNodeIdFromTabId,
  isDescendant = defaultIsDescendant
}) {
  if (!tree || typeof nodeIdFromTabId !== "function" || typeof isDescendant !== "function") {
    return DROP_BLOCK_REASONS.INVALID_CONTEXT;
  }

  const targetNodeId = nodeIdFromTabId(targetTabId);
  const targetNode = tree.nodes[targetNodeId];
  if (!targetNode) {
    return DROP_BLOCK_REASONS.MISSING_TARGET;
  }

  const sourceNodeIds = sourceTabIds.map((tabId) => nodeIdFromTabId(tabId));
  if (sourceNodeIds.includes(targetNodeId)) {
    return DROP_BLOCK_REASONS.SELF_TARGET;
  }

  const newParentNodeId = position === "inside"
    ? targetNodeId
    : targetNode.parentNodeId;
  const parentGroupId = newParentNodeId ? normalizedGroupId(tree.nodes[newParentNodeId]) : null;
  const expectedPinned = (() => {
    if (newParentNodeId) {
      return !!tree.nodes[newParentNodeId]?.pinned;
    }
    return !!targetNode.pinned;
  })();

  for (const sourceNodeId of sourceNodeIds) {
    const sourceNode = tree.nodes[sourceNodeId];
    if (!sourceNode) {
      return DROP_BLOCK_REASONS.MISSING_SOURCE;
    }

    if (newParentNodeId && isDescendant(tree, sourceNodeId, newParentNodeId)) {
      return DROP_BLOCK_REASONS.CYCLE;
    }

    if (!!sourceNode.pinned !== expectedPinned) {
      return DROP_BLOCK_REASONS.PINNED_MISMATCH;
    }

    if (newParentNodeId && parentGroupId === null && normalizedGroupId(sourceNode) !== null) {
      return DROP_BLOCK_REASONS.GROUP_BOUNDARY;
    }
  }

  return null;
}

export function canDrop({
  tree,
  sourceTabIds,
  targetTabId,
  position,
  nodeIdFromTabId = defaultNodeIdFromTabId,
  isDescendant = defaultIsDescendant
}) {
  if (!tree || typeof nodeIdFromTabId !== "function" || typeof isDescendant !== "function") {
    return false;
  }
  return dropBlockReason({
    tree,
    sourceTabIds,
    targetTabId,
    position,
    nodeIdFromTabId,
    isDescendant
  }) === null;
}

export function buildDropPayload({
  tree,
  sourceTabIds,
  targetTabId,
  position,
  nodeIdFromTabId = defaultNodeIdFromTabId
}) {
  if (!tree || typeof nodeIdFromTabId !== "function" || !Array.isArray(sourceTabIds) || !sourceTabIds.length) {
    return null;
  }
  const target = tree.nodes[nodeIdFromTabId(targetTabId)];
  if (!target || sourceTabIds.some((tabId) => !tree.nodes[nodeIdFromTabId(tabId)])) {
    return null;
  }
  // Every drag moves whole branches. The worker resolves current subtree bounds
  // for both single and multiple selection, without stale browser indices.
  if (position === "inside") {
    return {
      type: TREE_ACTIONS.BATCH_REPARENT,
      tabIds: [...sourceTabIds],
      newParentTabId: target.tabId,
      targetTabId: target.tabId,
      placement: "inside"
    };
  }
  if (position !== "before" && position !== "after") {
    return null;
  }
  if (target.parentNodeId) {
    return {
      type: TREE_ACTIONS.BATCH_REPARENT,
      tabIds: [...sourceTabIds],
      newParentTabId: tree.nodes[target.parentNodeId]?.tabId || null,
      targetTabId: target.tabId,
      placement: position
    };
  }
  return {
    type: TREE_ACTIONS.BATCH_MOVE_TO_ROOT,
    tabIds: [...sourceTabIds],
    targetTabId: target.tabId,
    placement: position
  };
}
