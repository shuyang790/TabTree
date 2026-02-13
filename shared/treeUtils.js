export function dedupeRootNodeIds(tree, nodeIds) {
  const picked = new Set(nodeIds);
  return nodeIds.filter((id) => {
    let current = tree.nodes[id]?.parentNodeId || null;
    while (current) {
      if (picked.has(current)) {
        return false;
      }
      current = tree.nodes[current]?.parentNodeId || null;
    }
    return true;
  });
}

export function subtreeTabIds(tree, rootNodeId) {
  const output = [];
  const stack = [rootNodeId];
  while (stack.length) {
    const currentId = stack.pop();
    const current = tree.nodes[currentId];
    if (!current) {
      continue;
    }
    output.push(current.tabId);
    stack.push(...current.childNodeIds);
  }
  return output;
}
