import { MESSAGE_TYPES, TREE_ACTIONS } from "../shared/constants.js";
import {
  buildTreeFromTabs,
  createEmptyWindowTree,
  getDescendantNodeIds,
  inferTreeFromSyncSnapshot,
  moveNode,
  normalizeGroupedTabParents,
  normalizeUrl,
  nodeIdFromTabId,
  reconcileSelectedTabId,
  removeNodePromoteChildren,
  removeSubtree,
  setActiveTab,
  sortTreeByIndex,
  toggleNodeCollapsed,
  upsertTabNode
} from "../shared/treeModel.js";
import { shouldProcessTabUpdate } from "./tabUpdates.js";
import { groupLiveTabIdsByWindow } from "./liveTabGrouping.js";
import { pruneTreeAgainstLiveTabs, removeTabIdsFromTree } from "./windowTreeReconciler.js";
import {
  loadAllWindowTrees,
  loadSettings,
  loadSyncSnapshot,
  loadWindowTree,
  removeWindowTree,
  saveSettings,
  saveSyncSnapshot,
  saveWindowTree
} from "../shared/treeStore.js";
import { createPersistCoordinator } from "./persistence.js";

const state = {
  settings: null,
  windows: {},
  initialized: false,
  syncSnapshot: null
};

const TAB_GROUP_COLORS = new Set(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"]);
const WINDOW_SYNC_DEBOUNCE_MS = 90;
const syncTimers = new Map();

function t(key, fallback = key) {
  return chrome.i18n.getMessage(key) || fallback;
}

const persistCoordinator = createPersistCoordinator({
  saveWindowTree,
  saveSyncSnapshot,
  getWindowsState: () => state.windows,
  onError: (error) => {
    console.warn("TabTree persistence flush failed", error);
  }
});

function getStatePayload(targetWindowId = null, changedWindowId = null, includeWindows = true) {
  const partial = Number.isInteger(changedWindowId);
  const windowsPayload = !includeWindows
    ? undefined
    : partial
      ? { [changedWindowId]: state.windows[changedWindowId] || null }
      : state.windows;

  return {
    settings: state.settings,
    windows: windowsPayload,
    focusedWindowId: targetWindowId,
    partial: includeWindows ? partial : false,
    changedWindowId
  };
}

function broadcastState(windowId = null, changedWindowId = null, includeWindows = true) {
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.STATE_UPDATED,
    payload: getStatePayload(windowId, changedWindowId, includeWindows)
  }).catch(() => {
    // No active side panel listener.
  });
}

function windowTree(windowId) {
  if (!state.windows[windowId]) {
    state.windows[windowId] = createEmptyWindowTree(windowId);
  }
  return state.windows[windowId];
}

function setWindowTree(nextTree) {
  state.windows[nextTree.windowId] = nextTree;
  persistCoordinator.markWindowDirty(nextTree.windowId);
  broadcastState(nextTree.windowId, nextTree.windowId);
}

async function getTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function getWindowActiveTabId(windowId) {
  try {
    const tabs = await chrome.tabs.query({ windowId, active: true });
    return tabs[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function getActiveTab() {
  const queryAttempts = [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true },
    { active: true }
  ];

  for (const queryInfo of queryAttempts) {
    try {
      const tabs = await chrome.tabs.query(queryInfo);
      if (tabs[0]) {
        return tabs[0];
      }
    } catch {
      // Continue to fallback attempts.
    }
  }

  try {
    const lastFocused = await chrome.windows.getLastFocused({ populate: true });
    const activeFromWindow = (lastFocused.tabs || []).find((tab) => tab.active);
    if (activeFromWindow) {
      return activeFromWindow;
    }
  } catch {
    // Continue to state fallback.
  }

  const trees = Object.values(state.windows);
  for (const tree of trees) {
    if (!tree?.selectedTabId) {
      continue;
    }
    const fallbackTab = await getTab(tree.selectedTabId);
    if (fallbackTab) {
      return fallbackTab;
    }
  }

  return null;
}

async function refreshGroupMetadata(windowId) {
  const current = windowTree(windowId);
  let groups = [];
  try {
    groups = await chrome.tabGroups.query({ windowId });
  } catch {
    groups = [];
  }

  const groupMap = {};
  for (const group of groups) {
    groupMap[group.id] = {
      id: group.id,
      title: group.title || t("unnamedGroup", "Unnamed group"),
      color: group.color,
      collapsed: !!group.collapsed
    };
  }

  setWindowTree({
    ...current,
    groups: groupMap,
    updatedAt: Date.now()
  });
}

function childInsertIndex(tree, parentNodeId, fallbackIndex) {
  const parentNode = tree.nodes[parentNodeId];
  if (!parentNode) {
    return fallbackIndex;
  }
  let maxIndex = typeof parentNode.index === "number" ? parentNode.index : fallbackIndex;
  const descendants = getDescendantNodeIds(tree, parentNodeId);
  for (const descId of descendants) {
    const node = tree.nodes[descId];
    if (node && typeof node.index === "number") {
      maxIndex = Math.max(maxIndex, node.index);
    }
  }
  return maxIndex + 1;
}

function initialTabUrl(tab) {
  if (typeof tab?.pendingUrl === "string" && tab.pendingUrl.length > 0) {
    return tab.pendingUrl;
  }
  if (typeof tab?.url === "string") {
    return tab.url;
  }
  return "";
}

function isBrowserNewTabUrl(url) {
  if (typeof url !== "string" || !url) {
    return false;
  }
  return url === "chrome://newtab/" || url === "chrome://newtab";
}

function canReparent(tree, movingNodeId, parentNodeId) {
  const moving = tree.nodes[movingNodeId];
  if (!moving) {
    return false;
  }
  if (!parentNodeId) {
    return true;
  }
  const parent = tree.nodes[parentNodeId];
  if (!parent) {
    return false;
  }
  // Keep pinned tabs in the pinned zone.
  if (!!moving.pinned !== !!parent.pinned) {
    return false;
  }
  return true;
}

function dedupeRootNodeIds(tree, nodeIds) {
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

function sortNodeIdsByTabIndex(tree, nodeIds) {
  return [...nodeIds].sort((a, b) => (tree.nodes[a]?.index ?? 0) - (tree.nodes[b]?.index ?? 0));
}

function removeTabIdsFromWindowTree(windowId, tabIds) {
  const result = removeTabIdsFromTree(windowTree(windowId), tabIds);
  if (result.changed) {
    setWindowTree(result.tree);
  }
  return result.changed;
}

async function pruneWindowTreeAgainstLiveTabs(windowId) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ windowId });
  } catch {
    return;
  }

  const liveTabIds = new Set(tabs.map((tab) => tab.id));
  const activeTabId = tabs.find((tab) => tab.active)?.id ?? null;
  const result = pruneTreeAgainstLiveTabs(windowTree(windowId), liveTabIds, activeTabId);
  if (result.changed) {
    setWindowTree(result.tree);
  }
}

async function syncWindowOrdering(windowId) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ windowId });
  } catch {
    return;
  }

  let next = windowTree(windowId);
  const liveTabIds = new Set(tabs.map((tab) => tab.id));

  for (const tab of tabs) {
    next = upsertTabNode(next, tab);
  }
  const activeTabId = tabs.find((tab) => tab.active)?.id ?? null;
  next = pruneTreeAgainstLiveTabs(next, liveTabIds, activeTabId).tree;

  next = normalizeGroupedTabParents(next);
  next = sortTreeByIndex(next);
  setWindowTree(next);
}

function scheduleWindowOrderingSync(windowId) {
  const existing = syncTimers.get(windowId);
  if (existing) {
    clearTimeout(existing);
  }
  const handle = setTimeout(() => {
    syncTimers.delete(windowId);
    void syncWindowOrdering(windowId);
  }, WINDOW_SYNC_DEBOUNCE_MS);
  syncTimers.set(windowId, handle);
}

async function ensureInitialized() {
  if (state.initialized) {
    return;
  }
  state.settings = await loadSettings();
  state.syncSnapshot = await loadSyncSnapshot();
  const previousTrees = await loadAllWindowTrees();
  await hydrateAllWindows(previousTrees);
  state.initialized = true;

  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    // Best effort.
  }
}

function scorePreviousTreeAgainstTabs(tree, tabs) {
  if (!tree?.nodes || !tabs.length) {
    return 0;
  }

  const currentUrls = new Set(
    tabs.map((tab) => normalizeUrl(initialTabUrl(tab))).filter((url) => !!url)
  );
  const currentTitles = new Set(
    tabs.map((tab) => tab.title || "").filter((title) => !!title)
  );

  if (!currentUrls.size && !currentTitles.size) {
    return 0;
  }

  let score = 0;
  for (const node of Object.values(tree.nodes)) {
    const nodeUrl = normalizeUrl(node.lastKnownUrl || "");
    if (nodeUrl && currentUrls.has(nodeUrl)) {
      score += 2;
      continue;
    }
    const nodeTitle = node.lastKnownTitle || "";
    if (nodeTitle && currentTitles.has(nodeTitle)) {
      score += 1;
    }
  }
  return score;
}

function pickBestPreviousTreeForTabs(tabs, treePool) {
  if (!tabs.length || !Array.isArray(treePool) || !treePool.length) {
    return null;
  }

  let bestIndex = -1;
  let bestScore = 0;
  for (let i = 0; i < treePool.length; i += 1) {
    const score = scorePreviousTreeAgainstTabs(treePool[i], tabs);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  if (bestIndex < 0 || bestScore <= 0) {
    return null;
  }

  const [best] = treePool.splice(bestIndex, 1);
  return best || null;
}

async function hydrateAllWindows(previousTrees = []) {
  const windows = await chrome.windows.getAll({ populate: true });
  const treePool = Array.isArray(previousTrees) ? [...previousTrees] : [];
  for (const win of windows) {
    await hydrateWindow(win.id, win.tabs || [], treePool);
  }
}

async function hydrateWindow(windowId, tabs, treePool = []) {
  let previous = await loadWindowTree(windowId);
  if (!previous && tabs.length) {
    previous = pickBestPreviousTreeForTabs(tabs, treePool);
  }
  let tree;

  if (tabs.length) {
    if (previous) {
      tree = buildTreeFromTabs(tabs, previous);
    } else {
      tree = inferTreeFromSyncSnapshot(windowId, tabs, state.syncSnapshot) || buildTreeFromTabs(tabs);
    }
  } else {
    tree = createEmptyWindowTree(windowId);
  }

  let groups = [];
  try {
    groups = await chrome.tabGroups.query({ windowId });
  } catch {
    groups = [];
  }
  tree.groups = {};
  for (const group of groups) {
    tree.groups[group.id] = {
      id: group.id,
      title: group.title || t("unnamedGroup", "Unnamed group"),
      color: group.color,
      collapsed: !!group.collapsed
    };
  }

  state.windows[windowId] = tree;
  persistCoordinator.markWindowDirty(windowId);
}

async function addChildTab(parentTabId) {
  const parentTab = await getTab(parentTabId);
  if (!parentTab) {
    return;
  }

  let tree = windowTree(parentTab.windowId);
  const parentNodeId = nodeIdFromTabId(parentTabId);
  // Keep tree and browser model aligned even if parent was missing from tree cache.
  if (!tree.nodes[parentNodeId]) {
    tree = upsertTabNode(tree, parentTab);
    setWindowTree(tree);
  }
  const insertIndex = childInsertIndex(tree, parentNodeId, parentTab.index + 1);

  const created = await chrome.tabs.create({
    windowId: parentTab.windowId,
    index: insertIndex,
    active: true,
    openerTabId: parentTabId
  });

  if (Number.isInteger(parentTab.groupId) && parentTab.groupId >= 0) {
    try {
      await chrome.tabs.group({ groupId: parentTab.groupId, tabIds: [created.id] });
    } catch {
      // Grouping is best effort.
    }
  }

  const next = upsertTabNode(windowTree(parentTab.windowId), created, {
    parentNodeId
  });
  setWindowTree(next);
}

async function closeSubtree(windowId, tabId, includeDescendants = true) {
  if (!includeDescendants) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // Tab may already be closed.
    }
    await pruneWindowTreeAgainstLiveTabs(windowId);
    return;
  }

  const tree = windowTree(windowId);
  const nodeId = nodeIdFromTabId(tabId);
  const { tree: next, removedTabIds } = removeSubtree(tree, nodeId);
  if (!removedTabIds.length) {
    await pruneWindowTreeAgainstLiveTabs(windowId);
    return;
  }
  setWindowTree(next);
  try {
    await chrome.tabs.remove(removedTabIds);
  } catch {
    // Best effort.
  }
  await pruneWindowTreeAgainstLiveTabs(windowId);
}

async function activateTab(tabId) {
  const tab = await getTab(tabId);
  if (!tab) {
    return;
  }
  await chrome.tabs.update(tabId, { active: true });
  if (tab.windowId) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
}

async function batchCloseSubtrees(tabIds) {
  const grouped = await groupLiveTabIdsByWindow(tabIds, {
    queryTabs: () => chrome.tabs.query({}),
    getTab
  });
  for (const [windowId, ids] of grouped.entries()) {
    const tree = windowTree(windowId);
    const nodeIds = ids.map((id) => nodeIdFromTabId(id)).filter((id) => !!tree.nodes[id]);
    const roots = dedupeRootNodeIds(tree, Array.from(new Set(nodeIds)));
    if (!roots.length) {
      continue;
    }

    let next = tree;
    const removeTabIds = [];
    for (const rootNodeId of roots) {
      const removed = removeSubtree(next, rootNodeId);
      next = removed.tree;
      removeTabIds.push(...removed.removedTabIds);
    }

    const uniqueRemoveIds = Array.from(new Set(removeTabIds));
    setWindowTree(next);
    if (uniqueRemoveIds.length) {
      try {
        await chrome.tabs.remove(uniqueRemoveIds);
      } catch {
        // Best effort.
      }
    }
    await pruneWindowTreeAgainstLiveTabs(windowId);
  }
}

async function batchCloseTabs(tabIds) {
  const requestedIds = Array.from(new Set(tabIds.filter((id) => Number.isFinite(id))));
  if (!requestedIds.length) {
    return;
  }

  const requestedByWindow = new Map();
  for (const tabId of requestedIds) {
    const nodeId = nodeIdFromTabId(tabId);
    for (const tree of Object.values(state.windows)) {
      if (!tree.nodes[nodeId]) {
        continue;
      }
      if (!requestedByWindow.has(tree.windowId)) {
        requestedByWindow.set(tree.windowId, []);
      }
      requestedByWindow.get(tree.windowId).push(tabId);
      break;
    }
  }

  const liveByWindow = await groupLiveTabIdsByWindow(requestedIds, {
    queryTabs: () => chrome.tabs.query({}),
    getTab
  });
  const affectedWindowIds = new Set([
    ...requestedByWindow.keys(),
    ...liveByWindow.keys()
  ]);

  for (const windowId of affectedWindowIds) {
    const requestedInWindow = Array.from(new Set(requestedByWindow.get(windowId) || []));
    const liveInWindow = Array.from(new Set(liveByWindow.get(windowId) || []));
    const liveSet = new Set(liveInWindow);
    const staleInWindow = requestedInWindow.filter((id) => !liveSet.has(id));

    if (staleInWindow.length) {
      removeTabIdsFromWindowTree(windowId, staleInWindow);
    }

    if (liveInWindow.length) {
      try {
        await chrome.tabs.remove(liveInWindow);
      } catch {
        // Best effort.
      }
    }
    await pruneWindowTreeAgainstLiveTabs(windowId);
  }
}

async function batchGroupNew(tabIds) {
  const grouped = await groupLiveTabIdsByWindow(tabIds, {
    queryTabs: () => chrome.tabs.query({}),
    getTab
  });
  for (const [windowId, ids] of grouped.entries()) {
    const tabs = await Promise.all(ids.map((id) => getTab(id)));
    const groupableTabIds = tabs
      .filter((tab) => tab && tab.windowId === windowId && !tab.pinned)
      .sort((a, b) => a.index - b.index)
      .map((tab) => tab.id);

    const uniqueTabIds = Array.from(new Set(groupableTabIds));
    if (!uniqueTabIds.length) {
      continue;
    }

    try {
      await chrome.tabs.group({ tabIds: uniqueTabIds });
    } catch {
      // Best effort.
    }

    await syncWindowOrdering(windowId);
    await refreshGroupMetadata(windowId);
  }
}

async function batchGroupExisting(tabIds, groupId, windowIdHint = null) {
  if (!Number.isInteger(groupId)) {
    return;
  }

  const targetWindowId = await resolveGroupWindowId(groupId, windowIdHint);
  if (!Number.isInteger(targetWindowId)) {
    return;
  }

  const grouped = await groupLiveTabIdsByWindow(tabIds, {
    queryTabs: () => chrome.tabs.query({}),
    getTab
  });
  const ids = grouped.get(targetWindowId) || [];
  if (!ids.length) {
    return;
  }

  const tabs = await Promise.all(ids.map((id) => getTab(id)));
  const groupableTabIds = tabs
    .filter((tab) => tab && tab.windowId === targetWindowId && !tab.pinned)
    .sort((a, b) => a.index - b.index)
    .map((tab) => tab.id);

  const uniqueTabIds = Array.from(new Set(groupableTabIds));
  if (!uniqueTabIds.length) {
    return;
  }

  try {
    await chrome.tabs.group({ groupId, tabIds: uniqueTabIds });
  } catch {
    // Best effort.
  }

  await syncWindowOrdering(targetWindowId);
  await refreshGroupMetadata(targetWindowId);
}

async function batchMoveToRoot(tabIds) {
  const grouped = await groupLiveTabIdsByWindow(tabIds, {
    queryTabs: () => chrome.tabs.query({}),
    getTab
  });
  for (const [windowId, ids] of grouped.entries()) {
    const tree = windowTree(windowId);
    const nodeIds = ids.map((id) => nodeIdFromTabId(id)).filter((id) => !!tree.nodes[id]);
    const orderedNodeIds = sortNodeIdsByTabIndex(tree, Array.from(new Set(nodeIds)));
    if (!orderedNodeIds.length) {
      continue;
    }

    let next = tree;
    for (const id of orderedNodeIds) {
      next = moveNode(next, id, null, null);
    }
    next = sortTreeByIndex(next);
    setWindowTree(next);

    const orderedTabIds = orderedNodeIds.map((id) => next.nodes[id]?.tabId).filter((id) => Number.isFinite(id));
    if (orderedTabIds.length) {
      try {
        await chrome.tabs.move(orderedTabIds, { index: -1 });
      } catch {
        // Best effort in mixed pin/group states.
      }
    }
  }
}

async function batchReparent(tabIds, newParentTabId) {
  const parentTab = await getTab(newParentTabId);
  if (!parentTab) {
    return;
  }

  const tree = windowTree(parentTab.windowId);
  const parentNodeId = nodeIdFromTabId(newParentTabId);
  if (!tree.nodes[parentNodeId]) {
    return;
  }

  const tabs = await Promise.all(tabIds.map((tabId) => getTab(tabId)));
  const sameWindowTabIds = tabs
    .filter((tab) => tab && tab.windowId === parentTab.windowId && tab.id !== newParentTabId)
    .map((tab) => tab.id);

  const sourceNodeIds = sameWindowTabIds
    .map((id) => nodeIdFromTabId(id))
    .filter((id) => !!tree.nodes[id]);

  const orderedNodeIds = sortNodeIdsByTabIndex(tree, Array.from(new Set(sourceNodeIds)));
  if (!orderedNodeIds.length) {
    return;
  }

  let next = tree;
  for (const sourceNodeId of orderedNodeIds) {
    if (!canReparent(next, sourceNodeId, parentNodeId)) {
      continue;
    }
    next = moveNode(next, sourceNodeId, parentNodeId, null);
  }

  next = sortTreeByIndex(next);
  setWindowTree(next);

  const moveTabIds = orderedNodeIds.map((id) => next.nodes[id]?.tabId).filter((id) => Number.isFinite(id));
  if (moveTabIds.length) {
    try {
      const insertIndex = childInsertIndex(next, parentNodeId, parentTab.index + 1);
      await chrome.tabs.move(moveTabIds, { index: insertIndex });
    } catch {
      // Best effort.
    }
  }

  if (Number.isInteger(parentTab.groupId) && parentTab.groupId >= 0 && moveTabIds.length) {
    try {
      await chrome.tabs.group({ groupId: parentTab.groupId, tabIds: moveTabIds });
    } catch {
      // Best effort.
    }
  }
}

function insertionIndexForGroupMove(tabs, sourceTabIds, payload) {
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

async function moveGroupBlock(payload) {
  const sourceGroupId = payload.sourceGroupId;
  const position = payload.position;
  if (!Number.isInteger(sourceGroupId) || (position !== "before" && position !== "after")) {
    return;
  }

  const windowId = await resolveGroupWindowId(sourceGroupId, payload.windowId);
  if (!Number.isInteger(windowId)) {
    return;
  }

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ windowId });
  } catch {
    return;
  }

  const sourceTabs = tabs
    .filter((tab) => tab.groupId === sourceGroupId)
    .sort((a, b) => a.index - b.index);
  const sourceTabIds = sourceTabs.map((tab) => tab.id);
  if (!sourceTabIds.length) {
    return;
  }

  if (Number.isFinite(payload.targetTabId) && sourceTabIds.includes(payload.targetTabId)) {
    return;
  }
  if (Number.isFinite(payload.targetGroupId) && payload.targetGroupId === sourceGroupId) {
    return;
  }

  const index = insertionIndexForGroupMove(tabs, sourceTabIds, payload);
  let moved = false;
  try {
    await chrome.tabGroups.move(sourceGroupId, { index });
    moved = true;
  } catch {
    // Fallback to tab move when group move fails.
  }

  if (!moved) {
    try {
      await chrome.tabs.move(sourceTabIds, { index });
    } catch {
      // Best effort.
    }
  }

  // Safety net: ensure all source tabs still belong to the source group after move.
  try {
    await chrome.tabs.group({ groupId: sourceGroupId, tabIds: sourceTabIds });
  } catch {
    // Best effort.
  }

  await syncWindowOrdering(windowId);
  await refreshGroupMetadata(windowId);
}

async function resolveGroupWindowId(groupId, windowIdHint = null) {
  if (Number.isInteger(windowIdHint)) {
    return windowIdHint;
  }

  const matchedWindow = Object.values(state.windows).find((win) =>
    Object.prototype.hasOwnProperty.call(win.groups || {}, groupId)
  );
  if (Number.isInteger(matchedWindow?.windowId)) {
    return matchedWindow.windowId;
  }

  try {
    const group = await chrome.tabGroups.get(groupId);
    if (Number.isInteger(group?.windowId)) {
      return group.windowId;
    }
  } catch {
    // Best effort.
  }

  return null;
}

async function renameGroup(groupId, title, windowIdHint = null) {
  if (!Number.isInteger(groupId) || typeof title !== "string") {
    return;
  }
  try {
    await chrome.tabGroups.update(groupId, { title: title.trim() });
  } catch {
    // Best effort.
  }

  const windowId = await resolveGroupWindowId(groupId, windowIdHint);
  if (Number.isInteger(windowId)) {
    await refreshGroupMetadata(windowId);
  }
}

async function resolveGroupIdFromTabIds(tabIds = []) {
  const uniqueTabIds = [...new Set((Array.isArray(tabIds) ? tabIds : [])
    .filter((tabId) => Number.isInteger(tabId)))];
  for (const tabId of uniqueTabIds) {
    const tab = await getTab(tabId);
    if (Number.isInteger(tab?.groupId) && tab.groupId >= 0) {
      return tab.groupId;
    }
  }
  return null;
}

async function updateGroupColorAndVerify(groupId, color) {
  const updatedGroup = await chrome.tabGroups.update(groupId, { color });
  if (updatedGroup?.color === color) {
    return updatedGroup;
  }
  const refreshedGroup = await chrome.tabGroups.get(groupId);
  if (refreshedGroup?.color === color) {
    return refreshedGroup;
  }
  throw new Error(`Tab group ${groupId} color did not update to ${color}`);
}

async function setGroupColor(groupId, color, windowIdHint = null, tabIds = []) {
  if (!Number.isInteger(groupId) || !TAB_GROUP_COLORS.has(color)) {
    return;
  }

  let effectiveGroupId = groupId;
  let updatedGroup = null;
  let lastError = null;

  try {
    updatedGroup = await updateGroupColorAndVerify(groupId, color);
  } catch (error) {
    lastError = error;
  }

  if (!updatedGroup) {
    const fallbackGroupId = await resolveGroupIdFromTabIds(tabIds);
    if (Number.isInteger(fallbackGroupId) && fallbackGroupId >= 0) {
      try {
        updatedGroup = await updateGroupColorAndVerify(fallbackGroupId, color);
        effectiveGroupId = fallbackGroupId;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (!updatedGroup) {
    throw lastError || new Error(`Failed to set color ${color} for tab group ${groupId}`);
  }

  const windowId = Number.isInteger(updatedGroup?.windowId)
    ? updatedGroup.windowId
    : await resolveGroupWindowId(effectiveGroupId, windowIdHint);
  if (Number.isInteger(windowId)) {
    await refreshGroupMetadata(windowId);
  }
}

async function handleTreeAction(payload) {
  const { type } = payload;
  if (type === TREE_ACTIONS.ADD_CHILD_TAB) {
    return addChildTab(payload.parentTabId);
  }

  if (type === TREE_ACTIONS.ACTIVATE_TAB) {
    return activateTab(payload.tabId);
  }

  if (type === TREE_ACTIONS.BATCH_CLOSE_TABS) {
    return batchCloseTabs(payload.tabIds || []);
  }

  if (type === TREE_ACTIONS.BATCH_GROUP_NEW) {
    return batchGroupNew(payload.tabIds || []);
  }

  if (type === TREE_ACTIONS.BATCH_GROUP_EXISTING) {
    return batchGroupExisting(payload.tabIds || [], payload.groupId, payload.windowId ?? null);
  }

  if (type === TREE_ACTIONS.BATCH_CLOSE_SUBTREES) {
    return batchCloseSubtrees(payload.tabIds || []);
  }

  if (type === TREE_ACTIONS.BATCH_MOVE_TO_ROOT) {
    return batchMoveToRoot(payload.tabIds || []);
  }

  if (type === TREE_ACTIONS.BATCH_REPARENT) {
    return batchReparent(payload.tabIds || [], payload.newParentTabId);
  }

  if (type === TREE_ACTIONS.MOVE_GROUP_BLOCK) {
    return moveGroupBlock(payload);
  }

  if (type === TREE_ACTIONS.RENAME_GROUP) {
    return renameGroup(payload.groupId, payload.title || "", payload.windowId ?? null);
  }

  if (type === TREE_ACTIONS.SET_GROUP_COLOR) {
    return setGroupColor(payload.groupId, payload.color, payload.windowId ?? null, payload.tabIds || []);
  }

  if (type === TREE_ACTIONS.TOGGLE_GROUP_COLLAPSE) {
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
      await chrome.tabGroups.update(groupId, { collapsed });
    } catch {
      // Best effort.
    }

    await refreshGroupMetadata(windowId);
    return;
  }

  if (type === TREE_ACTIONS.CLOSE_SUBTREE) {
    const closingTab = await getTab(payload.tabId);
    if (closingTab) {
      await closeSubtree(closingTab.windowId, payload.tabId, payload.includeDescendants ?? true);
      return;
    }

    const staleNodeId = nodeIdFromTabId(payload.tabId);
    const staleWindowId = Object.values(state.windows).find((win) => !!win.nodes[staleNodeId])?.windowId;
    if (Number.isInteger(staleWindowId)) {
      removeTabIdsFromWindowTree(staleWindowId, [payload.tabId]);
      await pruneWindowTreeAgainstLiveTabs(staleWindowId);
    }
    return;
  }

  const tab = await getTab(payload.tabId);
  if (!tab) {
    return;
  }
  const tree = windowTree(tab.windowId);
  const nodeId = nodeIdFromTabId(payload.tabId);

  if (type === TREE_ACTIONS.TOGGLE_COLLAPSE) {
    setWindowTree(toggleNodeCollapsed(tree, nodeId));
    return;
  }

  if (type === TREE_ACTIONS.REPARENT_TAB) {
    const parentNodeId = payload.newParentTabId ? nodeIdFromTabId(payload.newParentTabId) : null;
    if (!canReparent(tree, nodeId, parentNodeId)) {
      return;
    }
    if (!parentNodeId && payload.targetTabId) {
      const targetNode = tree.nodes[nodeIdFromTabId(payload.targetTabId)];
      const sourceNode = tree.nodes[nodeId];
      if (targetNode && sourceNode && !!targetNode.pinned !== !!sourceNode.pinned) {
        return;
      }
    }

    let next = moveNode(tree, nodeId, parentNodeId, payload.newIndex ?? null);
    next = sortTreeByIndex(next);
    setWindowTree(next);

    if (typeof payload.browserIndex === "number") {
      try {
        await chrome.tabs.move(payload.tabId, { index: payload.browserIndex });
      } catch {
        // Best effort.
      }
    }

    if (parentNodeId) {
      const parentTabId = tree.nodes[parentNodeId]?.tabId;
      const parentTab = parentTabId ? await getTab(parentTabId) : null;
      if (parentTab && Number.isInteger(parentTab.groupId) && parentTab.groupId >= 0) {
        try {
          await chrome.tabs.group({ groupId: parentTab.groupId, tabIds: [payload.tabId] });
        } catch {
          // Best effort.
        }
      }
    }
    return;
  }

  if (type === TREE_ACTIONS.MOVE_TO_ROOT) {
    let next = moveNode(tree, nodeId, null, payload.index ?? null);
    next = sortTreeByIndex(next);
    setWindowTree(next);

    if (typeof payload.browserIndex === "number") {
      try {
        await chrome.tabs.move(payload.tabId, { index: payload.browserIndex });
      } catch {
        // Best effort.
      }
    }
    return;
  }
}

async function promoteActiveTab() {
  const active = await getActiveTab();
  if (!active) {
    return;
  }
  const tree = windowTree(active.windowId);
  const node = tree.nodes[nodeIdFromTabId(active.id)];
  if (!node || !node.parentNodeId) {
    return;
  }
  const parent = tree.nodes[node.parentNodeId];
  const grandParentId = parent?.parentNodeId || null;
  setWindowTree(moveNode(tree, node.nodeId, grandParentId));
}

async function moveActiveUnderPreviousRootSibling() {
  const active = await getActiveTab();
  if (!active) {
    return;
  }
  const tree = windowTree(active.windowId);
  const nodeId = nodeIdFromTabId(active.id);
  const node = tree.nodes[nodeId];
  if (!node || node.parentNodeId) {
    return;
  }
  const rootIndex = tree.rootNodeIds.indexOf(nodeId);
  if (rootIndex <= 0) {
    return;
  }
  const previousRoot = tree.rootNodeIds[rootIndex - 1];
  setWindowTree(moveNode(tree, nodeId, previousRoot));
}

async function toggleActiveNodeCollapse() {
  const active = await getActiveTab();
  if (!active) {
    return;
  }
  const tree = windowTree(active.windowId);
  setWindowTree(toggleNodeCollapsed(tree, nodeIdFromTabId(active.id)));
}

async function focusSidePanel() {
  const active = await getActiveTab();
  const windowId = active?.windowId;
  if (!windowId) {
    return;
  }
  try {
    await chrome.sidePanel.open({ windowId });
  } catch {
    // Best effort.
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInitialized();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureInitialized();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    await ensureInitialized();

    if (message?.type === MESSAGE_TYPES.GET_STATE) {
      const requestedWindowId = message?.payload?.windowId;
      if (Number.isInteger(requestedWindowId)) {
        sendResponse({ ok: true, payload: getStatePayload(requestedWindowId) });
        return;
      }
      const active = await getActiveTab();
      sendResponse({ ok: true, payload: getStatePayload(active?.windowId || null) });
      return;
    }

    if (message?.type === MESSAGE_TYPES.PATCH_SETTINGS) {
      state.settings = await saveSettings({ ...state.settings, ...message.payload.settingsPatch });
      broadcastState(null, null, false);
      sendResponse({ ok: true, payload: state.settings });
      return;
    }

    if (message?.type === MESSAGE_TYPES.TREE_ACTION) {
      await handleTreeAction(message.payload);
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((err) => {
    sendResponse({ ok: false, error: String(err) });
  });

  return true;
});

chrome.tabs.onCreated.addListener(async (tab) => {
  await ensureInitialized();
  const tree = windowTree(tab.windowId);
  const openerNodeId = Number.isInteger(tab.openerTabId) ? nodeIdFromTabId(tab.openerTabId) : null;
  const openerNode = openerNodeId ? tree.nodes[openerNodeId] : null;
  const createdUrl = initialTabUrl(tab);

  if (openerNode && !!openerNode.pinned === !!tab.pinned && !isBrowserNewTabUrl(createdUrl)) {
    setWindowTree(upsertTabNode(tree, tab, { parentNodeId: openerNodeId }));
    return;
  }

  setWindowTree(upsertTabNode(tree, tab));
});

chrome.tabs.onUpdated.addListener(async (tabId, _changeInfo, tab) => {
  await ensureInitialized();
  const tree = windowTree(tab.windowId);
  if (!shouldProcessTabUpdate(tree, tabId, tab)) {
    return;
  }

  let next = upsertTabNode(tree, tab);
  if (tab.active && tree.selectedTabId !== tabId) {
    next = setActiveTab(next, tabId);
  }
  setWindowTree(next);
});

chrome.tabs.onMoved.addListener(async (tabId) => {
  await ensureInitialized();
  const tab = await getTab(tabId);
  if (!tab) {
    return;
  }
  scheduleWindowOrderingSync(tab.windowId);
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  await ensureInitialized();
  const tree = windowTree(windowId);
  setWindowTree(setActiveTab(tree, tabId));
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  await ensureInitialized();
  const tree = windowTree(removeInfo.windowId);
  const nodeId = nodeIdFromTabId(tabId);
  if (!tree.nodes[nodeId]) {
    return;
  }
  let next = removeNodePromoteChildren(tree, nodeId);
  const activeTabId = await getWindowActiveTabId(removeInfo.windowId);
  next = reconcileSelectedTabId(next, activeTabId);
  setWindowTree(next);
});

chrome.tabs.onAttached.addListener(async (tabId, attachInfo) => {
  await ensureInitialized();
  const tab = await getTab(tabId);
  if (!tab) {
    return;
  }
  const tree = windowTree(attachInfo.newWindowId);
  setWindowTree(upsertTabNode(tree, tab));
});

chrome.tabs.onDetached.addListener(async (tabId, detachInfo) => {
  await ensureInitialized();
  const tree = windowTree(detachInfo.oldWindowId);
  const nodeId = nodeIdFromTabId(tabId);
  if (!tree.nodes[nodeId]) {
    return;
  }
  let next = removeNodePromoteChildren(tree, nodeId);
  const activeTabId = await getWindowActiveTabId(detachInfo.oldWindowId);
  next = reconcileSelectedTabId(next, activeTabId);
  setWindowTree(next);
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  await ensureInitialized();
  delete state.windows[windowId];
  await removeWindowTree(windowId);
  persistCoordinator.forgetWindow(windowId);
  broadcastState();
});

chrome.tabGroups.onCreated.addListener(async (group) => {
  await ensureInitialized();
  await refreshGroupMetadata(group.windowId);
});

chrome.tabGroups.onUpdated.addListener(async (group) => {
  await ensureInitialized();
  scheduleWindowOrderingSync(group.windowId);
  await refreshGroupMetadata(group.windowId);
});

chrome.tabGroups.onMoved.addListener(async (group) => {
  await ensureInitialized();
  scheduleWindowOrderingSync(group.windowId);
  await refreshGroupMetadata(group.windowId);
});

chrome.tabGroups.onRemoved.addListener(async (group) => {
  await ensureInitialized();
  await refreshGroupMetadata(group.windowId);
});

chrome.commands.onCommand.addListener(async (command) => {
  await ensureInitialized();

  if (command === "add-child-tab") {
    const active = await getActiveTab();
    if (active) {
      await addChildTab(active.id);
    }
    return;
  }

  if (command === "focus-side-panel") {
    await focusSidePanel();
    return;
  }

  if (command === "promote-tab-level") {
    await promoteActiveTab();
    return;
  }

  if (command === "toggle-collapse-node") {
    await toggleActiveNodeCollapse();
    return;
  }

  if (command === "move-tab-under-previous-sibling") {
    await moveActiveUnderPreviousRootSibling();
  }
});

void ensureInitialized();
