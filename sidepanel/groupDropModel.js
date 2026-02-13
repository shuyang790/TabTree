import { TREE_ACTIONS } from "../shared/constants.js";

function defaultNodeIdFromTabId(tabId) {
  return `tab:${tabId}`;
}

export function canDropGroup({
  tree,
  sourceGroupId,
  targetGroupId = null,
  targetTabId = null,
  nodeIdFromTabId = defaultNodeIdFromTabId
}) {
  if (!tree || typeof nodeIdFromTabId !== "function" || !Number.isInteger(sourceGroupId)) {
    return false;
  }

  const sourceHasRows = Object.values(tree.nodes || {}).some(
    (node) => node.groupId === sourceGroupId && !node.pinned
  );
  if (!sourceHasRows) {
    return false;
  }

  if (Number.isInteger(targetGroupId) && targetGroupId === sourceGroupId) {
    return false;
  }

  if (!Number.isFinite(targetTabId)) {
    return true;
  }

  const targetNode = tree.nodes?.[nodeIdFromTabId(targetTabId)];
  if (!targetNode || targetNode.pinned || targetNode.parentNodeId) {
    return false;
  }
  if (targetNode.groupId === sourceGroupId) {
    return false;
  }
  return true;
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

