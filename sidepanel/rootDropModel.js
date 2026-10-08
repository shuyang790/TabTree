import { TREE_ACTIONS } from "../shared/constants.js";

function defaultNodeIdFromTabId(tabId) {
  return `tab:${tabId}`;
}

export function buildRootDropPayload({
  tree,
  draggingTabIds,
  nodeIdFromTabId = defaultNodeIdFromTabId
}) {
  if (
    !tree
    || !Array.isArray(draggingTabIds)
    || draggingTabIds.length === 0
    || typeof nodeIdFromTabId !== "function"
  ) {
    return null;
  }

  if (draggingTabIds.some((tabId) => !tree.nodes?.[nodeIdFromTabId(tabId)])) {
    return null;
  }
  return {
    type: TREE_ACTIONS.BATCH_MOVE_TO_ROOT,
    tabIds: [...draggingTabIds]
  };
}
