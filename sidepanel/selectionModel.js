export function selectedTabIdsArray(selectedTabIds) {
  return Array.from(selectedTabIds || []);
}

export function replaceSelection(tabIds, anchorTabId = null) {
  return {
    selectedTabIds: new Set((tabIds || []).filter((id) => Number.isFinite(id))),
    selectionAnchorTabId: Number.isFinite(anchorTabId) ? anchorTabId : null
  };
}

export function toggleSelection(selectionState, tabId) {
  const nextSelected = new Set(selectionState?.selectedTabIds || []);
  if (nextSelected.has(tabId)) {
    nextSelected.delete(tabId);
  } else {
    nextSelected.add(tabId);
  }

  let nextAnchor = selectionState?.selectionAnchorTabId ?? null;
  if (nextSelected.size === 0) {
    nextAnchor = null;
  } else if (!Number.isFinite(nextAnchor)) {
    nextAnchor = tabId;
  }

  return {
    selectedTabIds: nextSelected,
    selectionAnchorTabId: nextAnchor
  };
}

export function selectRangeTo(orderedTabIds, selectionState, tabId) {
  const ordered = Array.isArray(orderedTabIds) ? orderedTabIds : [];
  if (!ordered.length) {
    return replaceSelection([tabId], tabId);
  }

  const anchor = Number.isFinite(selectionState?.selectionAnchorTabId)
    ? selectionState.selectionAnchorTabId
    : tabId;
  const anchorIndex = ordered.indexOf(anchor);
  const targetIndex = ordered.indexOf(tabId);
  if (anchorIndex < 0 || targetIndex < 0) {
    return replaceSelection([tabId], tabId);
  }

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return replaceSelection(ordered.slice(start, end + 1), anchor);
}

export function selectedExistingTabIds(tree, selectedTabIds, nodeIdFromTabId) {
  if (!tree || typeof nodeIdFromTabId !== "function") {
    return [];
  }
  return selectedTabIdsArray(selectedTabIds)
    .filter((id) => Number.isFinite(id))
    .filter((id) => !!tree.nodes[nodeIdFromTabId(id)]);
}

export function pruneSelection(tree, selectionState) {
  if (!tree) {
    return replaceSelection([], null);
  }

  const existing = new Set(Object.values(tree.nodes).map((node) => node.tabId));
  const next = selectedTabIdsArray(selectionState?.selectedTabIds).filter((id) => existing.has(id));
  const anchor = existing.has(selectionState?.selectionAnchorTabId)
    ? selectionState.selectionAnchorTabId
    : null;
  return replaceSelection(next, anchor);
}
