import { TREE_ACTIONS } from "../shared/constants.js";

function defaultNodeIdFromTabId(tabId) {
  return `tab:${tabId}`;
}

export const GROUP_DROP_BLOCK_REASONS = Object.freeze({
  INVALID_CONTEXT: "invalid-context",
  MISSING_SOURCE_GROUP: "missing-source-group",
  SAME_GROUP: "same-group",
  MISSING_TARGET: "missing-target",
  PINNED_TARGET: "pinned-target",
  NON_ROOT_TARGET: "non-root-target"
});

export function groupDropBlockReason({
  tree,
  sourceGroupId,
  targetGroupId = null,
  targetTabId = null,
  nodeIdFromTabId = defaultNodeIdFromTabId
}) {
  if (!tree || typeof nodeIdFromTabId !== "function" || !Number.isInteger(sourceGroupId)) {
    return GROUP_DROP_BLOCK_REASONS.INVALID_CONTEXT;
  }

  const sourceHasRows = Object.values(tree.nodes || {}).some(
    (node) => node.groupId === sourceGroupId && !node.pinned
  );
  if (!sourceHasRows) {
    return GROUP_DROP_BLOCK_REASONS.MISSING_SOURCE_GROUP;
  }

  if (Number.isInteger(targetGroupId) && targetGroupId === sourceGroupId) {
    return GROUP_DROP_BLOCK_REASONS.SAME_GROUP;
  }

  if (!Number.isFinite(targetTabId)) {
    return null;
  }

  const targetNode = tree.nodes?.[nodeIdFromTabId(targetTabId)];
  if (!targetNode) {
    return GROUP_DROP_BLOCK_REASONS.MISSING_TARGET;
  }
  if (targetNode.pinned) {
    return GROUP_DROP_BLOCK_REASONS.PINNED_TARGET;
  }
  if (targetNode.parentNodeId) {
    return GROUP_DROP_BLOCK_REASONS.NON_ROOT_TARGET;
  }
  if (targetNode.groupId === sourceGroupId) {
    return GROUP_DROP_BLOCK_REASONS.SAME_GROUP;
  }
  return null;
}

export function canDropGroup({
  tree,
  sourceGroupId,
  targetGroupId = null,
  targetTabId = null,
  nodeIdFromTabId = defaultNodeIdFromTabId
}) {
  return groupDropBlockReason({
    tree,
    sourceGroupId,
    targetGroupId,
    targetTabId,
    nodeIdFromTabId
  }) === null;
}

export function buildMoveGroupBlockPayload({
  sourceGroupId,
  windowId,
  target,
  position
}) {
  if (
    !Number.isInteger(sourceGroupId)
    || !Number.isInteger(windowId)
    || (position !== "before" && position !== "after")
  ) {
    return null;
  }

  const payload = {
    type: TREE_ACTIONS.MOVE_GROUP_BLOCK,
    sourceGroupId,
    windowId,
    position
  };

  if (target?.kind === "group" && Number.isInteger(target.groupId)) {
    payload.targetGroupId = target.groupId;
  } else if (target?.kind === "tab" && Number.isFinite(target.tabId)) {
    payload.targetTabId = target.tabId;
  }

  return payload;
}
