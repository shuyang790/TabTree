export function uniqueFiniteTabIdsInOrder(tabIds) {
  return Array.from(new Set((tabIds || []).filter((id) => Number.isFinite(id))));
}

export function insertionIndexForGroupMove(tabs, sourceTabIds, payload) {
  const ordered = [...tabs].sort((a, b) => a.index - b.index);
  const sourceSet = new Set(sourceTabIds);
  const remaining = ordered.filter((tab) => !sourceSet.has(tab.id));
  if (!remaining.length) {
    return 0;
  }

  let targetPosition = null;
  if (Number.isFinite(payload.targetTabId)) {
    targetPosition = remaining.findIndex((tab) => tab.id === payload.targetTabId);
  } else if (Number.isFinite(payload.targetGroupId)) {
    const groupPositions = remaining
      .map((tab, idx) => ({ tab, idx }))
      .filter(({ tab }) => tab.groupId === payload.targetGroupId)
      .map(({ idx }) => idx);
    if (groupPositions.length) {
      targetPosition = payload.position === "after"
        ? groupPositions[groupPositions.length - 1]
        : groupPositions[0];
    }
  }

  if (targetPosition === null || targetPosition < 0) {
    return remaining.length;
  }

  if (payload.position === "after") {
    targetPosition += 1;
  }

  if (targetPosition >= remaining.length) {
    return -1;
  }
  return remaining[targetPosition].index;
}

export function relativeMoveDestinationIndex(anchorIndex, movingIndex, placement) {
  if (!Number.isFinite(anchorIndex) || !Number.isFinite(movingIndex)) {
    return -1;
  }
  if (placement !== "before" && placement !== "after") {
    return -1;
  }

  let destinationIndex = placement === "after" ? anchorIndex + 1 : anchorIndex;
  if (movingIndex < anchorIndex) {
    destinationIndex -= 1;
  }
  return Math.max(0, destinationIndex);
}

// Plan against the desired tree, not the old browser indices. Nonmoving tabs
// provide stable anchors, so source and target descendants stay contiguous.
export function subtreeBlockMovePlan(tree, movingTabIds) {
  const ordered = [];
  const visited = new Set();
  const stack = [...(tree.rootNodeIds || [])].reverse();
  while (stack.length) {
    const nodeId = stack.pop();
    const node = tree.nodes[nodeId];
    if (!node || visited.has(nodeId)) continue;
    visited.add(nodeId);
    ordered.push(node);
    stack.push(...[...(node.childNodeIds || [])].reverse());
  }
  const moving = new Set(movingTabIds);
  const plans = [];
  const pinnedCount = ordered.filter((node) => node.pinned).length;
  for (const pinned of [true, false]) {
    const zone = ordered.filter((node) => !!node.pinned === pinned);
    const tabs = zone.filter((node) => moving.has(node.tabId));
    if (!tabs.length) continue;
    const first = zone.indexOf(tabs[0]);
    const last = zone.indexOf(tabs[tabs.length - 1]);
    const after = zone.slice(last + 1).find((node) => !moving.has(node.tabId));
    const before = zone.slice(0, first).reverse().find((node) => !moving.has(node.tabId));
    plans.push({
      tabIds: tabs.map((node) => node.tabId),
      ...(after ? { targetTabId: after.tabId, placement: "before" }
        : before ? { targetTabId: before.tabId, placement: "after" }
          : { index: pinned ? 0 : pinnedCount })
    });
  }
  return plans;
}
