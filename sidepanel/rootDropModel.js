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

  if (draggingTabIds.length > 1) {
    return {
      type: TREE_ACTIONS.BATCH_MOVE_TO_ROOT,
      tabIds: [...draggingTabIds]
    };
  }

  const tabId = draggingTabIds[0];
  const draggingNode = tree.nodes?.[nodeIdFromTabId(tabId)];
  if (!draggingNode) {
    return null;
  }

  const maxBrowserIndex = Math.max(
    0,
    ...Object.values(tree.nodes || {})
      .filter((node) => !!node.pinned === !!draggingNode.pinned)
      .map((node) => node.index)
      .filter((index) => Number.isFinite(index))
  );

  return {
    type: TREE_ACTIONS.MOVE_TO_ROOT,
    tabId,
    browserIndex: maxBrowserIndex + 1
  };
}

