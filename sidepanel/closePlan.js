import { dedupeRootNodeIds, subtreeTabIds } from "../shared/treeUtils.js";

export function buildClosePlan(tree, tabIds, nodeIdFromTabId) {
  const nodeIds = tabIds
    .map((tabId) => nodeIdFromTabId(tabId))
    .filter((id) => !!tree.nodes[id]);

  const roots = dedupeRootNodeIds(tree, Array.from(new Set(nodeIds)));
  const allTabIds = new Set();
  for (const rootId of roots) {
    for (const tabId of subtreeTabIds(tree, rootId)) {
      allTabIds.add(tabId);
    }
  }

  return {
    rootTabIds: roots.map((id) => tree.nodes[id]?.tabId).filter((id) => Number.isFinite(id)),
    totalTabs: allTabIds.size
  };
}

export function shouldConfirmClose(settings, totalTabs, isBatch) {
  if (!settings || totalTabs < 2) {
    return false;
  }
  if (isBatch) {
    return !!settings.confirmCloseBatch;
  }
  return !!settings.confirmCloseSubtree;
}
