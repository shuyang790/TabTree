import { TREE_ACTIONS } from "../shared/constants.js";

function defaultNodeIdFromTabId(tabId) {
  return `tab:${tabId}`;
}

function defaultIsDescendant(tree, ancestorNodeId, maybeDescendantNodeId) {
  if (!ancestorNodeId || !maybeDescendantNodeId) {
    return false;
  }
  const stack = [...(tree.nodes[ancestorNodeId]?.childNodeIds || [])];
  while (stack.length) {
    const current = stack.pop();
    if (current === maybeDescendantNodeId) {
      return true;
    }
    stack.push(...(tree.nodes[current]?.childNodeIds || []));
  }
  return false;
}

function defaultSubtreeMaxIndex(tree, rootNodeId) {
  let max = tree.nodes[rootNodeId]?.index ?? 0;
  const stack = [...(tree.nodes[rootNodeId]?.childNodeIds || [])];
  while (stack.length) {
    const current = stack.pop();
    const node = tree.nodes[current];
    if (!node) {
      continue;
    }
    max = Math.max(max, node.index);
    stack.push(...node.childNodeIds);
  }
  return max;
}

function adjustBrowserIndexForSourceShift(requestedIndex, sourceIndex) {
  if (!Number.isFinite(requestedIndex)) {
    return requestedIndex;
  }
  let adjusted = requestedIndex;
  if (Number.isFinite(sourceIndex) && sourceIndex < requestedIndex) {
    adjusted -= 1;
  }
  return Math.max(0, adjusted);
}

export function canDrop({
  tree,
  sourceTabIds,
  targetTabId,
  position,
  nodeIdFromTabId = defaultNodeIdFromTabId,
  isDescendant = defaultIsDescendant
}) {
  if (!tree || typeof nodeIdFromTabId !== "function" || typeof isDescendant !== "function") {
    return false;
  }

  const targetNodeId = nodeIdFromTabId(targetTabId);
  const targetNode = tree.nodes[targetNodeId];
  if (!targetNode) {
    return false;
  }

  const sourceNodeIds = sourceTabIds.map((tabId) => nodeIdFromTabId(tabId));
  if (sourceNodeIds.includes(targetNodeId)) {
    return false;
  }

  let newParentNodeId = null;
  if (position === "inside") {
    newParentNodeId = targetNodeId;
  } else {
    newParentNodeId = targetNode.parentNodeId;
  }

  const expectedPinned = (() => {
    if (newParentNodeId) {
      return !!tree.nodes[newParentNodeId]?.pinned;
    }
    return !!targetNode.pinned;
  })();

  for (const sourceNodeId of sourceNodeIds) {
    const sourceNode = tree.nodes[sourceNodeId];
    if (!sourceNode) {
      return false;
    }

    if (newParentNodeId && isDescendant(tree, sourceNodeId, newParentNodeId)) {
      return false;
    }

    if (!!sourceNode.pinned !== expectedPinned) {
      return false;
    }
  }

  return true;
}

export function buildDropPayload({
  tree,
  sourceTabIds,
  targetTabId,
  position,
  nodeIdFromTabId = defaultNodeIdFromTabId,
  subtreeMaxIndex = defaultSubtreeMaxIndex
}) {
  if (!tree || typeof nodeIdFromTabId !== "function" || typeof subtreeMaxIndex !== "function") {
    return null;
  }

  const targetNodeId = nodeIdFromTabId(targetTabId);
  const target = tree.nodes[targetNodeId];
  if (!target) {
    return null;
  }

  if (sourceTabIds.length > 1) {
    if (position === "inside") {
      return {
        type: TREE_ACTIONS.BATCH_REPARENT,
        tabIds: sourceTabIds,
        newParentTabId: target.tabId,
        targetTabId: target.tabId,
        placement: "inside"
      };
    }
    if (target.parentNodeId) {
      return {
        type: TREE_ACTIONS.BATCH_REPARENT,
        tabIds: sourceTabIds,
        newParentTabId: tree.nodes[target.parentNodeId]?.tabId || null,
        targetTabId: target.tabId,
        placement: position
      };
    }
    return {
      type: TREE_ACTIONS.BATCH_MOVE_TO_ROOT,
      tabIds: sourceTabIds,
      targetTabId: target.tabId,
      placement: position
    };
  }

  const sourceTabId = sourceTabIds[0];
  const sourceNodeId = nodeIdFromTabId(sourceTabId);
  const source = tree.nodes[sourceNodeId];
  if (!source) {
    return null;
  }

  if (position === "inside") {
    const requestedBrowserIndex = subtreeMaxIndex(tree, targetNodeId) + 1;
    return {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: sourceTabId,
      targetTabId,
      newParentTabId: target.tabId,
      newIndex: target.childNodeIds.length,
      browserIndex: adjustBrowserIndexForSourceShift(requestedBrowserIndex, source.index)
    };
  }

  const parentNodeId = target.parentNodeId;
  const siblings = parentNodeId ? tree.nodes[parentNodeId]?.childNodeIds || [] : tree.rootNodeIds;
  let newIndex = siblings.indexOf(targetNodeId);
  if (position === "after") {
    newIndex += 1;
  }

  const oldIndexInSameList = siblings.indexOf(sourceNodeId);
  if (oldIndexInSameList >= 0 && oldIndexInSameList < newIndex) {
    newIndex -= 1;
  }

  const requestedBrowserIndex = target.index + (position === "after" ? 1 : 0);
  const browserIndex = adjustBrowserIndexForSourceShift(requestedBrowserIndex, source.index);

  if (parentNodeId) {
    return {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: sourceTabId,
      targetTabId,
      newParentTabId: tree.nodes[parentNodeId]?.tabId || null,
      newIndex,
      browserIndex
    };
  }

  return {
    type: TREE_ACTIONS.MOVE_TO_ROOT,
    tabId: sourceTabId,
    index: newIndex,
    browserIndex
  };
}
