function asNodeId(tabId) {
  return `tab:${tabId}`;
}

export function nodeIdFromTabId(tabId) {
  return asNodeId(tabId);
}

export function tabIdFromNodeId(nodeId) {
  if (!nodeId || !nodeId.startsWith("tab:")) {
    return null;
  }
  const parsed = Number(nodeId.slice(4));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeUrl(url) {
  if (!url || typeof url !== "string") {
    return "";
  }
  try {
    const u = new URL(url);
    u.hash = "";
    if (u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function createEmptyWindowTree(windowId) {
  return {
    windowId,
    version: 1,
    rootNodeIds: [],
    nodes: {},
    groups: {},
    selectedTabId: null,
    updatedAt: Date.now()
  };
}

function nodeFromTab(tab, parentNodeId = null, collapsed = false) {
  const nodeId = asNodeId(tab.id);
  return {
    nodeId,
    tabId: tab.id,
    parentNodeId,
    childNodeIds: [],
    collapsed,
    pinned: !!tab.pinned,
    groupId: Number.isInteger(tab.groupId) && tab.groupId >= 0 ? tab.groupId : null,
    index: typeof tab.index === "number" ? tab.index : 0,
    windowId: tab.windowId,
    active: !!tab.active,
    lastKnownTitle: tab.title || "New Tab",
    lastKnownUrl: tab.url || "",
    favIconUrl: tab.favIconUrl || "",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function cloneTree(tree) {
  return {
    ...tree,
    rootNodeIds: [...tree.rootNodeIds],
    groups: { ...(tree.groups || {}) },
    nodes: Object.fromEntries(
      Object.entries(tree.nodes).map(([id, n]) => [
        id,
        {
          ...n,
          childNodeIds: [...n.childNodeIds]
        }
      ])
    )
  };
}

function removeFromArray(arr, value) {
  const idx = arr.indexOf(value);
  if (idx >= 0) {
    arr.splice(idx, 1);
  }
}

function insertAt(arr, value, index = arr.length) {
  const bounded = Math.max(0, Math.min(index, arr.length));
  arr.splice(bounded, 0, value);
}

function isDescendant(tree, ancestorId, nodeId) {
  const stack = [...(tree.nodes[ancestorId]?.childNodeIds || [])];
  while (stack.length) {
    const current = stack.pop();
    if (current === nodeId) {
      return true;
    }
    stack.push(...(tree.nodes[current]?.childNodeIds || []));
  }
  return false;
}

export function getDescendantNodeIds(tree, nodeId) {
  const out = [];
  const stack = [...(tree.nodes[nodeId]?.childNodeIds || [])];
  while (stack.length) {
    const current = stack.pop();
    out.push(current);
    stack.push(...(tree.nodes[current]?.childNodeIds || []));
  }
  return out;
}

function hasNodeForTabId(tree, tabId) {
  if (!Number.isFinite(tabId)) {
    return false;
  }
  const node = tree.nodes[asNodeId(tabId)];
  return !!node && node.tabId === tabId;
}

export function reconcileSelectedTabId(tree, preferredTabId = null) {
  const preferred = Number.isFinite(preferredTabId) && hasNodeForTabId(tree, preferredTabId)
    ? preferredTabId
    : null;
  const existingSelected = Number.isFinite(tree.selectedTabId) && hasNodeForTabId(tree, tree.selectedTabId)
    ? tree.selectedTabId
    : null;
  const nextSelected = preferred ?? existingSelected;

  if (tree.selectedTabId === nextSelected) {
    return tree;
  }

  const next = cloneTree(tree);
  next.selectedTabId = nextSelected;
  next.updatedAt = Date.now();
  return next;
}

function sortRootsByTabIndex(tree) {
  tree.rootNodeIds.sort((a, b) => (tree.nodes[a]?.index || 0) - (tree.nodes[b]?.index || 0));
}

function sortChildrenByTabIndex(tree, parentNodeId) {
  const parent = tree.nodes[parentNodeId];
  if (!parent) {
    return;
  }
  parent.childNodeIds.sort((a, b) => (tree.nodes[a]?.index || 0) - (tree.nodes[b]?.index || 0));
}

function reparentNode(next, nodeId, parentNodeId, newIndex = null) {
  const node = next.nodes[nodeId];
  if (!node) {
    return;
  }
  if (parentNodeId && !next.nodes[parentNodeId]) {
    return;
  }
  if (parentNodeId === nodeId || (parentNodeId && isDescendant(next, nodeId, parentNodeId))) {
    return;
  }

  const oldParentId = node.parentNodeId;
  if (oldParentId && next.nodes[oldParentId]) {
    removeFromArray(next.nodes[oldParentId].childNodeIds, nodeId);
  } else {
    removeFromArray(next.rootNodeIds, nodeId);
  }

  node.parentNodeId = parentNodeId;
  if (parentNodeId) {
    const siblings = next.nodes[parentNodeId].childNodeIds;
    insertAt(siblings, nodeId, newIndex == null ? siblings.length : newIndex);
  } else {
    insertAt(next.rootNodeIds, nodeId, newIndex == null ? next.rootNodeIds.length : newIndex);
  }
}

export function upsertTabNode(tree, tab, options = {}) {
  const next = cloneTree(tree);
  const nodeId = asNodeId(tab.id);
  const existing = next.nodes[nodeId];
  if (!existing) {
    const parentNodeId = options.parentNodeId || null;
    const collapsed = !!options.collapsed;
    next.nodes[nodeId] = nodeFromTab(tab, parentNodeId, collapsed);
    if (parentNodeId && next.nodes[parentNodeId]) {
      next.nodes[parentNodeId].childNodeIds.push(nodeId);
      sortChildrenByTabIndex(next, parentNodeId);
    } else {
      next.rootNodeIds.push(nodeId);
      sortRootsByTabIndex(next);
    }
  } else {
    existing.pinned = !!tab.pinned;
    existing.groupId = Number.isInteger(tab.groupId) && tab.groupId >= 0 ? tab.groupId : null;
    existing.index = typeof tab.index === "number" ? tab.index : existing.index;
    existing.windowId = tab.windowId;
    existing.active = !!tab.active;
    existing.lastKnownTitle = tab.title || existing.lastKnownTitle;
    existing.lastKnownUrl = tab.url || existing.lastKnownUrl;
    existing.favIconUrl = tab.favIconUrl || existing.favIconUrl;
    existing.updatedAt = Date.now();
    if (options.parentNodeId && options.parentNodeId !== existing.parentNodeId) {
      reparentNode(next, nodeId, options.parentNodeId, options.newIndex ?? null);
    }
    if (existing.parentNodeId) {
      sortChildrenByTabIndex(next, existing.parentNodeId);
    } else {
      sortRootsByTabIndex(next);
    }
  }
  next.selectedTabId = tab.active ? tab.id : next.selectedTabId;
  next.updatedAt = Date.now();
  return next;
}

export function setActiveTab(tree, tabId) {
  const next = cloneTree(tree);
  next.selectedTabId = tabId;
  for (const node of Object.values(next.nodes)) {
    node.active = node.tabId === tabId;
  }
  next.updatedAt = Date.now();
  return next;
}

export function moveNode(tree, nodeId, newParentNodeId = null, newIndex = null) {
  const next = cloneTree(tree);
  reparentNode(next, nodeId, newParentNodeId, newIndex);
  next.updatedAt = Date.now();
  return next;
}

export function toggleNodeCollapsed(tree, nodeId) {
  const next = cloneTree(tree);
  const node = next.nodes[nodeId];
  if (!node) {
    return next;
  }
  node.collapsed = !node.collapsed;
  node.updatedAt = Date.now();
  next.updatedAt = Date.now();
  return next;
}

export function removeNodePromoteChildren(tree, nodeId) {
  const next = cloneTree(tree);
  const node = next.nodes[nodeId];
  if (!node) {
    return next;
  }

  const parentId = node.parentNodeId;
  const children = [...node.childNodeIds];

  if (parentId && next.nodes[parentId]) {
    const parent = next.nodes[parentId];
    const insertionPoint = parent.childNodeIds.indexOf(nodeId);
    removeFromArray(parent.childNodeIds, nodeId);
    children.forEach((childId, offset) => {
      const childNode = next.nodes[childId];
      if (childNode) {
        childNode.parentNodeId = parentId;
      }
      insertAt(parent.childNodeIds, childId, insertionPoint + offset);
    });
  } else {
    const insertionPoint = next.rootNodeIds.indexOf(nodeId);
    removeFromArray(next.rootNodeIds, nodeId);
    children.forEach((childId, offset) => {
      const childNode = next.nodes[childId];
      if (childNode) {
        childNode.parentNodeId = null;
      }
      insertAt(next.rootNodeIds, childId, insertionPoint + offset);
    });
  }

  delete next.nodes[nodeId];
  if (next.selectedTabId === node.tabId) {
    next.selectedTabId = null;
  }
  next.updatedAt = Date.now();
  return next;
}

export function removeSubtree(tree, nodeId) {
  const next = cloneTree(tree);
  const node = next.nodes[nodeId];
  if (!node) {
    return { tree: next, removedTabIds: [] };
  }

  const removal = [nodeId, ...getDescendantNodeIds(next, nodeId)];
  const removedTabIds = [];

  const parentId = node.parentNodeId;
  if (parentId && next.nodes[parentId]) {
    removeFromArray(next.nodes[parentId].childNodeIds, nodeId);
  } else {
    removeFromArray(next.rootNodeIds, nodeId);
  }

  for (const id of removal) {
    const removing = next.nodes[id];
    if (removing) {
      removedTabIds.push(removing.tabId);
      delete next.nodes[id];
    }
  }

  if (removedTabIds.includes(next.selectedTabId)) {
    next.selectedTabId = null;
  }
  next.updatedAt = Date.now();
  return { tree: next, removedTabIds };
}

export function ensureValidTree(tree) {
  const next = cloneTree(tree);

  const known = new Set(Object.keys(next.nodes));
  next.rootNodeIds = next.rootNodeIds.filter((id) => known.has(id));

  for (const node of Object.values(next.nodes)) {
    node.childNodeIds = node.childNodeIds.filter((id) => known.has(id) && id !== node.nodeId);
    if (node.parentNodeId && !known.has(node.parentNodeId)) {
      node.parentNodeId = null;
    }
  }

  for (const [id, node] of Object.entries(next.nodes)) {
    if (!node.parentNodeId && !next.rootNodeIds.includes(id)) {
      next.rootNodeIds.push(id);
    }
  }

  next.updatedAt = Date.now();
  return next;
}

export function normalizeGroupedTabParents(tree) {
  const next = cloneTree(tree);
  let changed = false;

  for (const [nodeId, node] of Object.entries(next.nodes)) {
    if (!Number.isInteger(node.groupId) || node.groupId < 0 || !node.parentNodeId) {
      continue;
    }

    const parentNode = next.nodes[node.parentNodeId];
    const parentGroupId = Number.isInteger(parentNode?.groupId) && parentNode.groupId >= 0
      ? parentNode.groupId
      : null;

    if (parentGroupId === node.groupId) {
      continue;
    }

    if (parentNode) {
      removeFromArray(parentNode.childNodeIds, nodeId);
    }
    node.parentNodeId = null;
    if (!next.rootNodeIds.includes(nodeId)) {
      next.rootNodeIds.push(nodeId);
    }
    changed = true;
  }

  if (!changed) {
    return next;
  }

  return sortTreeByIndex(ensureValidTree(next));
}

export function buildTreeFromTabs(tabs, previousTree = null) {
  const tree = createEmptyWindowTree(tabs[0]?.windowId ?? -1);
  tree.groups = { ...(previousTree?.groups || {}) };
  const sortedTabs = [...tabs].sort((a, b) => a.index - b.index);

  const previousRecords = [];
  if (previousTree?.nodes) {
    for (const node of Object.values(previousTree.nodes)) {
      previousRecords.push({
        url: normalizeUrl(node.lastKnownUrl),
        parentUrl: node.parentNodeId ? normalizeUrl(previousTree.nodes[node.parentNodeId]?.lastKnownUrl) : null,
        collapsed: !!node.collapsed
      });
    }
  }

  const previousByUrl = new Map();
  for (const record of previousRecords) {
    if (!previousByUrl.has(record.url)) {
      previousByUrl.set(record.url, []);
    }
    previousByUrl.get(record.url).push(record);
  }

  const matchedByTabId = new Map();
  for (const tab of sortedTabs) {
    const url = normalizeUrl(tab.url);
    const matches = previousByUrl.get(url);
    const match = matches?.shift() || null;
    if (match) {
      matchedByTabId.set(tab.id, match);
    }
  }

  const firstTabByUrl = new Map();
  const secondTabByUrl = new Map();
  for (const tab of sortedTabs) {
    const url = normalizeUrl(tab.url);
    const first = firstTabByUrl.get(url);
    if (!first) {
      firstTabByUrl.set(url, tab);
      continue;
    }
    if (!secondTabByUrl.has(url) && first.id !== tab.id) {
      secondTabByUrl.set(url, tab);
    }
  }

  for (const tab of sortedTabs) {
    const match = matchedByTabId.get(tab.id);
    const node = nodeFromTab(tab, null, !!match?.collapsed);
    tree.nodes[node.nodeId] = node;
    tree.rootNodeIds.push(node.nodeId);
    if (tab.active) {
      tree.selectedTabId = tab.id;
    }
  }

  // First attempt: restore parent by previous URL relation.
  for (const tab of sortedTabs) {
    const match = matchedByTabId.get(tab.id);
    if (!match?.parentUrl) {
      continue;
    }
    const firstCandidate = firstTabByUrl.get(match.parentUrl) || null;
    const secondCandidate = secondTabByUrl.get(match.parentUrl) || null;
    const parentTab = firstCandidate?.id !== tab.id
      ? firstCandidate
      : secondCandidate;
    if (!parentTab || parentTab.id === tab.id) {
      continue;
    }
    const nodeId = asNodeId(tab.id);
    const parentNodeId = asNodeId(parentTab.id);
    if (!tree.nodes[nodeId] || !tree.nodes[parentNodeId]) {
      continue;
    }
    removeFromArray(tree.rootNodeIds, nodeId);
    tree.nodes[nodeId].parentNodeId = parentNodeId;
    tree.nodes[parentNodeId].childNodeIds.push(nodeId);
  }

  for (const rootId of [...tree.rootNodeIds]) {
    const node = tree.nodes[rootId];
    if (node && node.parentNodeId) {
      removeFromArray(tree.rootNodeIds, rootId);
    }
  }

  for (const id of Object.keys(tree.nodes)) {
    const node = tree.nodes[id];
    if (node.parentNodeId) {
      sortChildrenByTabIndex(tree, node.parentNodeId);
    }
  }
  sortRootsByTabIndex(tree);

  return ensureValidTree(tree);
}

export function sortTreeByIndex(tree) {
  const next = cloneTree(tree);
  sortRootsByTabIndex(next);
  for (const [nodeId, node] of Object.entries(next.nodes)) {
    if (node.childNodeIds.length) {
      sortChildrenByTabIndex(next, nodeId);
    }
  }
  next.updatedAt = Date.now();
  return next;
}

export function buildSyncSnapshot(windowsState, limits) {
  const windowEntries = Object.values(windowsState)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limits.maxWindows)
    .map((windowTree) => {
      const nodes = [];
      const pushNode = (nodeId) => {
        const node = windowTree.nodes[nodeId];
        if (!node || nodes.length >= limits.maxNodesPerWindow) {
          return;
        }
        nodes.push({
          u: normalizeUrl(node.lastKnownUrl).slice(0, limits.maxUrlLength),
          p: node.parentNodeId ? normalizeUrl(windowTree.nodes[node.parentNodeId]?.lastKnownUrl || "").slice(0, limits.maxUrlLength) : "",
          c: node.collapsed ? 1 : 0
        });
        for (const child of node.childNodeIds) {
          pushNode(child);
        }
      };
      for (const root of windowTree.rootNodeIds) {
        pushNode(root);
      }
      return {
        w: String(windowTree.windowId),
        n: nodes
      };
    });

  return {
    v: 1,
    t: Date.now(),
    windows: windowEntries
  };
}

export function inferTreeFromSyncSnapshot(windowId, tabs, syncSnapshot) {
  if (!syncSnapshot || !Array.isArray(syncSnapshot.windows)) {
    return null;
  }
  const windowCandidate = syncSnapshot.windows.find((win) => win.w === String(windowId));
  if (!windowCandidate || !Array.isArray(windowCandidate.n)) {
    return null;
  }

  const syntheticPrevious = {
    nodes: {}
  };

  windowCandidate.n.forEach((entry, idx) => {
    const nodeId = `snapshot:${idx}`;
    const parentNodeId = entry.p ? `snapshot-parent:${idx}` : null;
    syntheticPrevious.nodes[nodeId] = {
      lastKnownUrl: entry.u,
      parentNodeId,
      collapsed: !!entry.c
    };
    if (parentNodeId) {
      syntheticPrevious.nodes[parentNodeId] = {
        lastKnownUrl: entry.p,
        parentNodeId: null,
        collapsed: false
      };
    }
  });

  return buildTreeFromTabs(tabs, syntheticPrevious);
}
