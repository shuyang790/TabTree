export async function handleToggleGroupCollapseAction(payload, deps) {
  const {
    resolveGroupWindowId,
    windowTree,
    updateGroupCollapsed,
    refreshGroupMetadata
  } = deps;

  const groupId = payload.groupId;
  if (!Number.isInteger(groupId)) {
    return;
  }

  const windowId = await resolveGroupWindowId(groupId, payload.windowId);
  if (!Number.isInteger(windowId)) {
    return;
  }

  const tree = windowTree(windowId);
  const group = tree.groups?.[groupId];
  const collapsed = typeof payload.collapsed === "boolean" ? payload.collapsed : !group?.collapsed;

  try {
    await updateGroupCollapsed(groupId, collapsed);
  } catch {
    // Best effort.
  }

  await refreshGroupMetadata(windowId);
}

export async function handleCloseSubtreeAction(payload, deps) {
  const {
    getTab,
    closeSubtree,
    nodeIdFromTabId,
    resolveStaleWindowIdByNodeId,
    removeTabIdsFromWindowTree,
    pruneWindowTreeAgainstLiveTabs
  } = deps;

  const closingTab = await getTab(payload.tabId);
  if (closingTab) {
    await closeSubtree(closingTab.windowId, payload.tabId, payload.includeDescendants ?? true);
    return;
  }

  const staleNodeId = nodeIdFromTabId(payload.tabId);
  const staleWindowId = resolveStaleWindowIdByNodeId(staleNodeId);
  if (!Number.isInteger(staleWindowId)) {
    return;
  }

  removeTabIdsFromWindowTree(staleWindowId, [payload.tabId]);
  await pruneWindowTreeAgainstLiveTabs(staleWindowId);
}

export async function handleReparentTabAction({ payload, tab, tree, nodeId }, deps) {
  const {
    nodeIdFromTabId,
    canReparent,
    moveNode,
    sortTreeByIndex,
    resolveBrowserMoveIndex,
    moveTab,
    logUnexpectedFailure,
    setWindowTree,
    getTab,
    groupTabs,
    syncWindowOrdering
  } = deps;

  const parentNodeId = payload.newParentTabId ? nodeIdFromTabId(payload.newParentTabId) : null;
  if (!canReparent(tree, nodeId, parentNodeId)) {
    return false;
  }
  if (!parentNodeId && payload.targetTabId) {
    const targetNode = tree.nodes[nodeIdFromTabId(payload.targetTabId)];
    const sourceNode = tree.nodes[nodeId];
    if (targetNode && sourceNode && !!targetNode.pinned !== !!sourceNode.pinned) {
      return false;
    }
  }

  let next = moveNode(tree, nodeId, parentNodeId, payload.newIndex ?? null);
  next = sortTreeByIndex(next);

  let movedInBrowser = true;
  const browserIndex = await resolveBrowserMoveIndex(tab.windowId, payload.browserIndex);
  if (browserIndex !== null) {
    try {
      await moveTab(payload.tabId, browserIndex);
    } catch (error) {
      logUnexpectedFailure("reparentTab.move", error, {
        windowId: tab.windowId,
        tabId: payload.tabId,
        browserIndex
      });
      movedInBrowser = false;
    }
  }

  if (movedInBrowser) {
    setWindowTree(next);
  }

  if (movedInBrowser && parentNodeId) {
    const parentTabId = tree.nodes[parentNodeId]?.tabId;
    const parentTab = parentTabId ? await getTab(parentTabId) : null;
    if (parentTab && Number.isInteger(parentTab.groupId) && parentTab.groupId >= 0) {
      try {
        await groupTabs(parentTab.groupId, [payload.tabId]);
      } catch (error) {
        logUnexpectedFailure("reparentTab.group", error, {
          windowId: tab.windowId,
          tabId: payload.tabId,
          groupId: parentTab.groupId
        });
      }
    }
  }
  await syncWindowOrdering(tab.windowId);
  return movedInBrowser;
}

export async function handleMoveToRootAction({ payload, tab, tree, nodeId }, deps) {
  const {
    moveNode,
    sortTreeByIndex,
    resolveBrowserMoveIndex,
    moveTab,
    logUnexpectedFailure,
    setWindowTree,
    syncWindowOrdering
  } = deps;

  let next = moveNode(tree, nodeId, null, payload.index ?? null);
  next = sortTreeByIndex(next);

  let movedInBrowser = true;
  const browserIndex = await resolveBrowserMoveIndex(tab.windowId, payload.browserIndex);
  if (browserIndex !== null) {
    try {
      await moveTab(payload.tabId, browserIndex);
    } catch (error) {
      logUnexpectedFailure("moveToRoot.move", error, {
        windowId: tab.windowId,
        tabId: payload.tabId,
        browserIndex
      });
      movedInBrowser = false;
    }
  }
  if (movedInBrowser) {
    setWindowTree(next);
  }
  await syncWindowOrdering(tab.windowId);
  return movedInBrowser;
}
