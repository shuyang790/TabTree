export function uniqueFiniteTabIdsInOrder(tabIds) {
  return Array.from(new Set((tabIds || []).filter((id) => Number.isFinite(id))));
}

export function browserInsertionIndexForRelativePlacement(tabs, movingTabIds, targetTabId, placement) {
  if (!Array.isArray(tabs) || !Array.isArray(movingTabIds)) {
    return -1;
  }
  if (!Number.isFinite(targetTabId) || (placement !== "before" && placement !== "after")) {
    return -1;
  }

  const ordered = [...tabs].sort((a, b) => a.index - b.index);
  const movingSet = new Set(movingTabIds);
  const remaining = ordered.filter((tab) => !movingSet.has(tab.id));
  if (!remaining.length) {
    return 0;
  }

  const targetPos = remaining.findIndex((tab) => tab.id === targetTabId);
  if (targetPos < 0) {
    return -1;
  }

  const insertionPos = placement === "after" ? targetPos + 1 : targetPos;
  if (insertionPos >= remaining.length) {
    return -1;
  }

  return insertionPos;
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
