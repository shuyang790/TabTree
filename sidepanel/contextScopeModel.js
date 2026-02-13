export function resolveContextScopeTabIds({
  tree,
  primaryTabId,
  selectedTabIds,
  nodeIdFromTabId
}) {
  if (!tree || !Number.isFinite(primaryTabId) || typeof nodeIdFromTabId !== "function") {
    return [];
  }

  if (!tree.nodes[nodeIdFromTabId(primaryTabId)]) {
    return [];
  }

  const selected = Array.from(selectedTabIds || [])
    .filter((id) => Number.isFinite(id))
    .filter((id) => !!tree.nodes[nodeIdFromTabId(id)]);

  if (selected.includes(primaryTabId)) {
    return Array.from(new Set(selected));
  }
  return [primaryTabId];
}
