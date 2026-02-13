export function matchesSearch(node, query) {
  if (!query) {
    return true;
  }
  const haystack = `${node.lastKnownTitle || ""} ${node.lastKnownUrl || ""}`.toLowerCase();
  return haystack.includes(query);
}

export function buildVisibilityMap(tree, query) {
  const visibility = new Map();
  if (!query) {
    return visibility;
  }

  const visit = (nodeKey) => {
    if (visibility.has(nodeKey)) {
      return visibility.get(nodeKey);
    }

    const node = tree.nodes[nodeKey];
    if (!node) {
      visibility.set(nodeKey, false);
      return false;
    }

    let childVisible = false;
    for (const childId of node.childNodeIds) {
      childVisible = visit(childId) || childVisible;
    }

    const visible = matchesSearch(node, query) || childVisible;
    visibility.set(nodeKey, visible);
    return visible;
  };

  for (const rootNodeId of tree.rootNodeIds) {
    visit(rootNodeId);
  }
  return visibility;
}

export function shouldRenderNode(tree, nodeKey, query, visibilityByNodeId) {
  if (!query) {
    return !!tree.nodes[nodeKey];
  }
  return visibilityByNodeId.get(nodeKey) === true;
}
