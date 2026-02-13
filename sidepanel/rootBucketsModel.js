export function groupTabIds(tree, groupId) {
  return Object.values(tree?.nodes || {})
    .filter((node) => node.groupId === groupId)
    .map((node) => node.tabId)
    .filter((tabId) => Number.isFinite(tabId));
}

export function rootBuckets(tree, options = {}) {
  const { showGroupHeaders = false } = options;
  const pinned = [];
  const blocks = [];
  const groupBlockById = new Map();

  for (const rootNodeId of tree?.rootNodeIds || []) {
    const node = tree.nodes?.[rootNodeId];
    if (!node) {
      continue;
    }
    if (node.pinned) {
      pinned.push(rootNodeId);
      continue;
    }
    if (showGroupHeaders && node.groupId !== null) {
      if (!groupBlockById.has(node.groupId)) {
        const block = {
          type: "group",
          groupId: node.groupId,
          rootNodeIds: []
        };
        groupBlockById.set(node.groupId, block);
        blocks.push(block);
      }
      groupBlockById.get(node.groupId).rootNodeIds.push(rootNodeId);
      continue;
    }
    blocks.push({
      type: "node",
      rootNodeId
    });
  }

  return { pinned, blocks };
}

