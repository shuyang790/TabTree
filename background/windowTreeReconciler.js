import { nodeIdFromTabId, reconcileSelectedTabId, removeNodePromoteChildren } from "../shared/treeModel.js";

export function removeTabIdsFromTree(tree, tabIds, preferredTabId = null) {
  const uniqueTabIds = Array.from(new Set(tabIds.filter((id) => Number.isFinite(id))));
  if (!uniqueTabIds.length) {
    return { tree, changed: false };
  }

  let next = tree;
  let changed = false;
  for (const tabId of uniqueTabIds) {
    const staleNodeId = nodeIdFromTabId(tabId);
    if (!next.nodes[staleNodeId]) {
      continue;
    }
    next = removeNodePromoteChildren(next, staleNodeId);
    changed = true;
  }

  if (!changed) {
    return { tree, changed: false };
  }

  return {
    tree: reconcileSelectedTabId(next, preferredTabId),
    changed: true
  };
}

export function pruneTreeAgainstLiveTabs(tree, liveTabIds, activeTabId = null) {
  const liveSet = liveTabIds instanceof Set
    ? liveTabIds
    : new Set(Array.from(liveTabIds || []).filter((id) => Number.isFinite(id)));

  let next = tree;
  const staleNodeIds = Object.keys(next.nodes).filter((id) => {
    const tabId = next.nodes[id]?.tabId;
    return Number.isFinite(tabId) && !liveSet.has(tabId);
  });

  let changed = false;
  for (const staleNodeId of staleNodeIds) {
    if (!next.nodes[staleNodeId]) {
      continue;
    }
    next = removeNodePromoteChildren(next, staleNodeId);
    changed = true;
  }

  const selectedIsLive = Number.isFinite(next.selectedTabId) && liveSet.has(next.selectedTabId);
  const reconciled = selectedIsLive
    ? next
    : reconcileSelectedTabId(next, activeTabId);
  if (reconciled !== next) {
    next = reconciled;
    changed = true;
  }

  return { tree: next, changed };
}
