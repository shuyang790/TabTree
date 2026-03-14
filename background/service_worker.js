import {
  isTreeActionType,
  LOCAL_ARCHIVE_MAX_TREES,
  LOCAL_ARCHIVE_RETENTION_MS,
  MESSAGE_TYPES,
  TREE_ACTIONS
} from "../shared/constants.js";
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
import { dedupeRootNodeIds } from "../shared/treeUtils.js";
import {
  browserInsertionIndexForRelativePlacement,
  insertionIndexForGroupMove,
  relativeMoveDestinationIndex,
  uniqueFiniteTabIdsInOrder
} from "./treeActionHelpers.js";
import { shouldProcessTabUpdate } from "./tabUpdates.js";
import { groupLiveTabIdsByWindow } from "./liveTabGrouping.js";
import { pruneTreeAgainstLiveTabs, removeTabIdsFromTree } from "./windowTreeReconciler.js";
import {
  loadAllWindowTrees,
  loadLocalSnapshot,
  loadRestoreArchive,
  loadSettings,
  loadSyncSnapshot,
  loadWindowTree,
  removeWindowTree,
  saveLocalSnapshot,
  saveRestoreArchive,
  saveSettings,
  saveSyncSnapshot,
  saveWindowTree
} from "../shared/treeStore.js";
import { createPersistCoordinator } from "./persistence.js";
import { createInitCoordinator } from "./initCoordinator.js";
import { createWindowMutationQueue } from "./mutationQueue.js";
import { createWindowOrderSyncCoordinator } from "./orderSyncCoordinator.js";
import { createActionError, toActionErrorPayload } from "./actionError.js";
import {
  handleCloseSubtreeAction,
  handleMoveToRootAction,
  handleReparentTabAction,
  handleToggleGroupCollapseAction
} from "./treeActionHandlers.js";

const state = {
  settings: null,
  windows: {},
  initialized: false,
  localSnapshot: null,
  restoreArchive: null,
  restoreArchiveIds: {},
  syncSnapshot: null,
  lastMoveByWindow: {}
};

const TAB_GROUP_COLORS = new Set(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"]);
const WINDOW_SYNC_DEBOUNCE_MS = 90;
const ACTION_ERROR_CODES = {
  UNSUPPORTED_TREE_ACTION: "UNSUPPORTED_TREE_ACTION",
  TREE_ACTION_FAILED: "TREE_ACTION_FAILED",
  UNKNOWN_MESSAGE_TYPE: "UNKNOWN_MESSAGE_TYPE",
  MESSAGE_HANDLER_FAILED: "MESSAGE_HANDLER_FAILED"
};
const LOW_CONFIDENCE_RESTORE_SCORE = 3;
const STARTUP_RECONCILE_DELAYS_MS = [2000, 6000];

function t(key, fallback = key) {
  return chrome.i18n.getMessage(key) || fallback;
}

function logUnexpectedFailure(operation, error, context = {}) {
  console.warn(`TabTree ${operation} failed`, context, error);
}

const persistCoordinator = createPersistCoordinator({
  saveWindowTree,
  saveLocalSnapshot: async (windowsState) => {
    state.localSnapshot = await saveLocalSnapshot(windowsState);
  },
  saveRestoreArchive: async (windowsState) => {
    state.restoreArchive = await saveRestoreArchive(windowsState, state.restoreArchiveIds, state.restoreArchive);
  },
  saveSyncSnapshot,
  getWindowsState: () => state.windows,
  onError: (error) => {
    console.warn("TabTree persistence flush failed", error);
  }
});

const mutationQueue = createWindowMutationQueue({
  onError: (error, context) => {
    logUnexpectedFailure("mutationQueue", error, context);
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

function createRestoreArchiveId() {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `restore-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureWindowRestoreArchiveId(windowId, preferredId = null) {
  if (!Number.isInteger(windowId)) {
    return typeof preferredId === "string" && preferredId.length ? preferredId : createRestoreArchiveId();
  }
  if (typeof preferredId === "string" && preferredId.length) {
    state.restoreArchiveIds[windowId] = preferredId;
    return preferredId;
  }
  if (typeof state.restoreArchiveIds[windowId] === "string" && state.restoreArchiveIds[windowId].length) {
    return state.restoreArchiveIds[windowId];
  }
  const archiveId = createRestoreArchiveId();
  state.restoreArchiveIds[windowId] = archiveId;
  return archiveId;
}

function setWindowTree(nextTree, options = {}) {
  const now = Date.now();
  const restoreArchiveId = ensureWindowRestoreArchiveId(
    nextTree.windowId,
    options.restoreArchiveId ?? nextTree.restoreArchiveId ?? null
  );
  const persistedTree = {
    ...nextTree,
    restoreArchiveId,
    archivedAt: null,
    lastSeenAt: now,
    persistenceVersion: 1
  };
  state.windows[persistedTree.windowId] = persistedTree;
  persistCoordinator.markWindowDirty(persistedTree.windowId);
  broadcastState(persistedTree.windowId, persistedTree.windowId);
}

async function archiveWindowTree(windowId) {
  if (!Number.isInteger(windowId)) {
    return;
  }
  const existing = state.windows[windowId] || await loadWindowTree(windowId);
  if (!existing || typeof existing !== "object") {
    return;
  }

  const now = Date.now();
  await saveWindowTree({
    ...existing,
    archivedAt: now,
    lastSeenAt: Number.isFinite(existing.lastSeenAt) ? existing.lastSeenAt : now,
    persistenceVersion: 1
  });
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

function queueMutation(windowId, operation, context = {}) {
  return mutationQueue.run(windowId, operation, context);
}

async function resolveTreeActionWindowId(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (Number.isInteger(payload.windowId)) {
    return payload.windowId;
  }

  const type = payload.type;
  const handler = resolveTreeActionHandler(type);
  if (!handler || typeof handler.resolveWindowId !== "function") {
    return null;
  }

  return handler.resolveWindowId(payload);
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

function createUndoToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function setLastMove(windowId, undoPayload) {
  if (!Number.isInteger(windowId) || !undoPayload) {
    return null;
  }
  const token = createUndoToken();
  state.lastMoveByWindow[windowId] = {
    token,
    undoPayload
  };
  return token;
}

function clearLastMove(windowId) {
  if (!Number.isInteger(windowId)) {
    return;
  }
  delete state.lastMoveByWindow[windowId];
}

function captureTabMoveRecord(tree, tabId) {
  if (!tree || !Number.isFinite(tabId)) {
    return null;
  }
  const sourceNodeId = nodeIdFromTabId(tabId);
  const sourceNode = tree.nodes[sourceNodeId];
  if (!sourceNode) {
    return null;
  }
  const siblings = sourceNode.parentNodeId
    ? (tree.nodes[sourceNode.parentNodeId]?.childNodeIds || [])
    : tree.rootNodeIds;
  return {
    tabId: sourceNode.tabId,
    parentTabId: sourceNode.parentNodeId ? tree.nodes[sourceNode.parentNodeId]?.tabId || null : null,
    childIndex: Math.max(0, siblings.indexOf(sourceNodeId)),
    browserIndex: Number.isFinite(sourceNode.index) ? sourceNode.index : 0
  };
}

function captureTabMoveRecords(tree, tabIds) {
  const records = [];
  for (const tabId of uniqueFiniteTabIdsInOrder(tabIds || [])) {
    const record = captureTabMoveRecord(tree, tabId);
    if (record) {
      records.push(record);
    }
  }
  return records;
}

async function groupLiveTabIdsByWindowInRequestOrder(tabIds) {
  const grouped = new Map();
  const uniqueTabIds = uniqueFiniteTabIdsInOrder(tabIds);
  if (!uniqueTabIds.length) {
    return grouped;
  }

  const liveTabs = await Promise.all(uniqueTabIds.map((tabId) => getTab(tabId)));
  for (const tab of liveTabs) {
    if (!tab || !Number.isInteger(tab.windowId)) {
      continue;
    }
    if (!grouped.has(tab.windowId)) {
      grouped.set(tab.windowId, []);
    }
    grouped.get(tab.windowId).push(tab.id);
  }
  return grouped;
}

async function resolveBrowserMoveIndex(windowId, requestedIndex) {
  if (!Number.isFinite(requestedIndex)) {
    return null;
  }

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ windowId });
  } catch {
    return null;
  }

  const maxIndex = Math.max(0, tabs.length - 1);
  return Math.max(0, Math.min(Math.trunc(requestedIndex), maxIndex));
}

async function moveTabsRelativeToTarget(windowId, moveTabIds, targetTabId, placement) {
  if (!Number.isInteger(windowId) || !Number.isFinite(targetTabId) || !Array.isArray(moveTabIds) || !moveTabIds.length) {
    return false;
  }
  if (placement !== "before" && placement !== "after") {
    return false;
  }

  let anchorTabId = targetTabId;
  for (const tabId of moveTabIds) {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({ windowId });
    } catch (error) {
      logUnexpectedFailure("relativeMove.queryTabs", error, { windowId, targetTabId, tabId, placement });
      return false;
    }

    const anchorTab = tabs.find((tab) => tab.id === anchorTabId);
    const movingTab = tabs.find((tab) => tab.id === tabId);
    if (!anchorTab || !movingTab) {
      return false;
    }

    const destinationIndex = relativeMoveDestinationIndex(anchorTab.index, movingTab.index, placement);
    try {
      await chrome.tabs.move(tabId, { index: destinationIndex });
    } catch (error) {
      logUnexpectedFailure("relativeMove.moveTab", error, {
        windowId,
        targetTabId,
        tabId,
        placement,
        destinationIndex
      });
      return false;
    }

    if (placement === "after") {
      anchorTabId = tabId;
    }
  }

  return true;
}

async function restoreTabPlacements(windowId, records) {
  if (!Number.isInteger(windowId) || !Array.isArray(records) || !records.length) {
    return false;
  }

  const orderedRecords = [...records]
    .filter((record) => Number.isFinite(record?.tabId))
    .sort((a, b) => (a.browserIndex ?? 0) - (b.browserIndex ?? 0));
  if (!orderedRecords.length) {
    return false;
  }

  let next = windowTree(windowId);
  let changed = false;

  for (const record of orderedRecords) {
    const tab = await getTab(record.tabId);
    if (!tab || tab.windowId !== windowId) {
      continue;
    }

    const sourceNodeId = nodeIdFromTabId(record.tabId);
    if (!next.nodes[sourceNodeId]) {
      continue;
    }

    const desiredParentNodeId = Number.isFinite(record.parentTabId)
      ? nodeIdFromTabId(record.parentTabId)
      : null;
    const parentNodeId = desiredParentNodeId && next.nodes[desiredParentNodeId]
      ? desiredParentNodeId
      : null;

    const siblings = parentNodeId
      ? (next.nodes[parentNodeId]?.childNodeIds || [])
      : next.rootNodeIds;
    const targetIndex = Number.isInteger(record.childIndex)
      ? Math.max(0, Math.min(record.childIndex, siblings.length))
      : null;

    next = moveNode(next, sourceNodeId, parentNodeId, targetIndex);
    changed = true;

    const browserIndex = await resolveBrowserMoveIndex(windowId, record.browserIndex);
    if (browserIndex !== null) {
      try {
        await chrome.tabs.move(record.tabId, { index: browserIndex });
      } catch (error) {
        logUnexpectedFailure("undo.restoreTab.move", error, {
          windowId,
          tabId: record.tabId,
          browserIndex
        });
      }
    }

    if (parentNodeId) {
      const parentTabId = next.nodes[parentNodeId]?.tabId;
      const parentTab = Number.isFinite(parentTabId) ? await getTab(parentTabId) : null;
      if (Number.isInteger(parentTab?.groupId) && parentTab.groupId >= 0) {
        try {
          await chrome.tabs.group({ groupId: parentTab.groupId, tabIds: [record.tabId] });
        } catch (error) {
          logUnexpectedFailure("undo.restoreTab.group", error, {
            windowId,
            tabId: record.tabId,
            groupId: parentTab.groupId
          });
        }
      }
    }
  }

  if (changed) {
    setWindowTree(sortTreeByIndex(next));
    await runWindowOrderingSyncNow(windowId);
  }

  return changed;
}

async function moveGroupToIndex(windowId, sourceGroupId, index) {
  if (!Number.isInteger(windowId) || !Number.isInteger(sourceGroupId) || !Number.isFinite(index)) {
    return false;
  }

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ windowId });
  } catch {
    return false;
  }

  const sourceTabs = tabs
    .filter((tab) => tab.groupId === sourceGroupId)
    .sort((a, b) => a.index - b.index);
  const sourceTabIds = sourceTabs.map((tab) => tab.id);
  if (!sourceTabIds.length) {
    return false;
  }

  let moved = false;
  try {
    await chrome.tabGroups.move(sourceGroupId, { index });
    moved = true;
  } catch (error) {
    logUnexpectedFailure("moveGroupToIndex.moveGroup", error, {
      windowId,
      sourceGroupId,
      index
    });
  }

  if (!moved) {
    try {
      await chrome.tabs.move(sourceTabIds, { index });
      moved = true;
    } catch (error) {
      logUnexpectedFailure("moveGroupToIndex.moveTabs", error, {
        windowId,
        sourceGroupId,
        tabIds: sourceTabIds,
        index
      });
      return false;
    }
  }

  try {
    await chrome.tabs.group({ groupId: sourceGroupId, tabIds: sourceTabIds });
  } catch (error) {
    logUnexpectedFailure("moveGroupToIndex.regroupTabs", error, {
      windowId,
      sourceGroupId,
      tabIds: sourceTabIds
    });
  }

  await runWindowOrderingSyncNow(windowId);
  await refreshGroupMetadata(windowId);
  return true;
}

async function undoLastTreeMove(windowIdHint = null, expectedToken = null) {
  let windowId = Number.isInteger(windowIdHint) ? windowIdHint : null;
  if (!Number.isInteger(windowId)) {
    const active = await getActiveTab();
    if (Number.isInteger(active?.windowId)) {
      windowId = active.windowId;
    }
  }
  if (!Number.isInteger(windowId)) {
    return null;
  }

  const entry = state.lastMoveByWindow[windowId];
  if (!entry?.undoPayload) {
    return null;
  }
  if (typeof expectedToken === "string" && entry.token !== expectedToken) {
    return null;
  }

  let undone = false;
  if (entry.undoPayload.kind === "tabs") {
    undone = await restoreTabPlacements(windowId, entry.undoPayload.records || []);
  } else if (entry.undoPayload.kind === "group-block") {
    undone = await moveGroupToIndex(windowId, entry.undoPayload.sourceGroupId, entry.undoPayload.previousIndex);
  }

  if (undone) {
    clearLastMove(windowId);
  }

  return {
    windowId,
    undone
  };
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
  next = { ...next, groups: groupMap };

  setWindowTree(next);
  if (Number.isInteger(activeTabId)) {
    await ensureSelectedTabVisible(windowId, activeTabId);
  }
}

function resolveStaleWindowIdByNodeId(targetNodeId) {
  return Object.values(state.windows).find((win) => !!win.nodes[targetNodeId])?.windowId;
}

const orderSyncCoordinator = createWindowOrderSyncCoordinator({
  delayMs: WINDOW_SYNC_DEBOUNCE_MS,
  runSync: async (windowId) => {
    if (mutationQueue.isExecuting(windowId)) {
      await syncWindowOrdering(windowId);
      return;
    }
    await queueMutation(windowId, async () => {
      await syncWindowOrdering(windowId);
    }, { operation: "syncWindowOrdering" });
  },
  onError: (error, context) => {
    logUnexpectedFailure("syncWindowOrdering", error, context);
  }
});

async function runWindowOrderingSyncNow(windowId) {
  if (!Number.isInteger(windowId)) {
    return;
  }
  await orderSyncCoordinator.runNow(windowId);
}

function scheduleWindowOrderingSync(windowId) {
  if (!Number.isInteger(windowId)) {
    return;
  }
  orderSyncCoordinator.schedule(windowId);
}

async function resolveGroupWindowIdFromEvent(group) {
  if (Number.isInteger(group?.windowId)) {
    return group.windowId;
  }
  if (!Number.isInteger(group?.id)) {
    return null;
  }
  return resolveGroupWindowId(group.id, null);
}

async function ensureSelectedTabVisible(windowId, tabId) {
  if (!Number.isInteger(windowId) || !Number.isInteger(tabId)) {
    return;
  }

  const selectedNodeId = nodeIdFromTabId(tabId);
  const tree = windowTree(windowId);
  const selectedNode = tree.nodes[selectedNodeId];
  if (!selectedNode) {
    return;
  }

  let next = tree;
  let changed = false;
  let ancestorNodeId = selectedNode.parentNodeId;
  while (ancestorNodeId) {
    const ancestorNode = next.nodes[ancestorNodeId];
    if (!ancestorNode) {
      break;
    }
    if (ancestorNode.collapsed) {
      next = toggleNodeCollapsed(next, ancestorNodeId);
      changed = true;
    }
    ancestorNodeId = next.nodes[ancestorNodeId]?.parentNodeId || null;
  }
  if (changed) {
    setWindowTree(next);
  }

  const effectiveTree = changed ? next : tree;
  const groupId = Number.isInteger(selectedNode.groupId) && selectedNode.groupId >= 0
    ? selectedNode.groupId
    : null;
  if (!Number.isInteger(groupId)) {
    return;
  }

  const group = effectiveTree.groups?.[groupId];
  if (!group?.collapsed) {
    return;
  }

  try {
    await chrome.tabGroups.update(groupId, { collapsed: false });
  } catch (error) {
    logUnexpectedFailure("ensureSelectedTabVisible.expandGroup", error, { windowId, tabId, groupId });
    return;
  }

  await refreshGroupMetadata(windowId);
}

function treeTimestamp(tree) {
  if (!tree || typeof tree !== "object") {
    return 0;
  }
  const updatedAt = Number.isFinite(tree.updatedAt) ? tree.updatedAt : 0;
  const lastSeenAt = Number.isFinite(tree.lastSeenAt) ? tree.lastSeenAt : 0;
  const archivedAt = Number.isFinite(tree.archivedAt) ? tree.archivedAt : 0;
  return Math.max(updatedAt, lastSeenAt, archivedAt);
}

function treeNodeCount(tree) {
  return tree?.nodes ? Object.keys(tree.nodes).length : 0;
}

function restoreCandidateKey(tree) {
  if (!tree || typeof tree !== "object") {
    return null;
  }
  if (typeof tree.restoreArchiveId === "string" && tree.restoreArchiveId.length) {
    return `restore:${tree.restoreArchiveId}`;
  }
  if (Number.isInteger(tree.windowId)) {
    return `window:${tree.windowId}`;
  }
  return null;
}

function dedupeTreePool(trees = []) {
  const byCandidateKey = new Map();
  for (const tree of trees) {
    if (!tree || typeof tree !== "object" || !Number.isInteger(tree.windowId) || !tree.nodes) {
      continue;
    }
    const candidateKey = restoreCandidateKey(tree) || `window:${tree.windowId}:${treeTimestamp(tree)}`;
    const existing = byCandidateKey.get(candidateKey);
    if (!existing || treeTimestamp(tree) >= treeTimestamp(existing)) {
      byCandidateKey.set(candidateKey, tree);
    }
  }
  return Array.from(byCandidateKey.values());
}

function buildCountMap(items) {
  const map = new Map();
  for (const item of items) {
    if (!item) {
      continue;
    }
    map.set(item, (map.get(item) || 0) + 1);
  }
  return map;
}

function overlapCount(a, b) {
  let total = 0;
  for (const [key, countA] of a.entries()) {
    const countB = b.get(key) || 0;
    if (countB > 0) {
      total += Math.min(countA, countB);
    }
  }
  return total;
}

function scorePreviousTreeAgainstTabs(tree, tabs) {
  if (!tree?.nodes || !tabs.length) {
    return 0;
  }

  const orderedTabs = [...tabs].sort((a, b) => a.index - b.index);
  const tabUrls = orderedTabs.map((tab) => normalizeUrl(initialTabUrl(tab))).filter((value) => !!value);
  const tabTitles = orderedTabs.map((tab) => (tab.title || "").trim()).filter((value) => !!value);
  const treeNodes = Object.values(tree.nodes || {})
    .filter((node) => node && typeof node === "object")
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const treeUrls = treeNodes.map((node) => normalizeUrl(node.lastKnownUrl || "")).filter((value) => !!value);
  const treeTitles = treeNodes.map((node) => (node.lastKnownTitle || "").trim()).filter((value) => !!value);

  if (!tabUrls.length && !tabTitles.length) {
    return 0;
  }

  const urlScore = overlapCount(buildCountMap(tabUrls), buildCountMap(treeUrls)) * 4;
  const titleScore = overlapCount(buildCountMap(tabTitles), buildCountMap(treeTitles)) * 2;
  const sizeScore = Math.max(0, 10 - Math.abs(orderedTabs.length - treeNodes.length));
  const compareLength = Math.min(20, orderedTabs.length, treeNodes.length);
  let pinnedScore = 0;
  for (let i = 0; i < compareLength; i += 1) {
    if (!!orderedTabs[i]?.pinned === !!treeNodes[i]?.pinned) {
      pinnedScore += 1;
    }
  }

  const orderedTabUrls = orderedTabs.map((tab) => normalizeUrl(initialTabUrl(tab))).filter((value) => !!value);
  const orderedTreeUrls = treeNodes.map((node) => normalizeUrl(node.lastKnownUrl || "")).filter((value) => !!value);
  const orderedCompareLength = Math.min(compareLength, orderedTabUrls.length, orderedTreeUrls.length);
  let orderScore = 0;
  for (let i = 0; i < orderedCompareLength; i += 1) {
    if (orderedTabUrls[i] && orderedTabUrls[i] === orderedTreeUrls[i]) {
      orderScore += 1;
    }
  }

  const archivedPenalty = Number.isFinite(tree.archivedAt)
    ? Math.min(4, Math.floor((Date.now() - tree.archivedAt) / (24 * 60 * 60 * 1000)))
    : 0;
  return Math.max(0, urlScore + titleScore + sizeScore + pinnedScore + orderScore - archivedPenalty);
}

function assignBestPreviousTrees(windows, treePool) {
  const assignments = new Map();
  if (!Array.isArray(windows) || !windows.length || !Array.isArray(treePool) || !treePool.length) {
    return assignments;
  }

  const pairs = [];
  for (const win of windows) {
    const tabs = win.tabs || [];
    for (let i = 0; i < treePool.length; i += 1) {
      const candidate = treePool[i];
      const score = scorePreviousTreeAgainstTabs(candidate, tabs);
      if (score <= 0) {
        continue;
      }
      pairs.push({
        windowId: win.id,
        treeIndex: i,
        score,
        treeTs: treeTimestamp(candidate)
      });
    }
  }

  pairs.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.treeTs !== a.treeTs) {
      return b.treeTs - a.treeTs;
    }
    if (a.windowId !== b.windowId) {
      return a.windowId - b.windowId;
    }
    return a.treeIndex - b.treeIndex;
  });

  const usedWindows = new Set();
  const usedTrees = new Set();
  for (const pair of pairs) {
    if (usedWindows.has(pair.windowId) || usedTrees.has(pair.treeIndex)) {
      continue;
    }
    usedWindows.add(pair.windowId);
    usedTrees.add(pair.treeIndex);
    assignments.set(pair.windowId, {
      tree: treePool[pair.treeIndex],
      score: pair.score
    });
  }

  return assignments;
}

async function treeWithCurrentGroupMetadata(windowId, tree) {
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

  return {
    ...tree,
    groups: groupMap
  };
}

async function pruneArchivedLocalTrees(currentWindowIds = []) {
  const trees = await loadAllWindowTrees();
  if (!trees.length) {
    return;
  }

  const currentSet = new Set(currentWindowIds.filter((id) => Number.isInteger(id)));
  const now = Date.now();
  const removalIds = new Set();
  const archivedCandidates = [];

  for (const tree of trees) {
    if (!tree || !Number.isInteger(tree.windowId) || currentSet.has(tree.windowId)) {
      continue;
    }
    if (Number.isFinite(tree.archivedAt) && (now - tree.archivedAt) > LOCAL_ARCHIVE_RETENTION_MS) {
      removalIds.add(tree.windowId);
      continue;
    }
    if (Number.isFinite(tree.archivedAt)) {
      archivedCandidates.push(tree);
    }
  }

  archivedCandidates.sort((a, b) => treeTimestamp(b) - treeTimestamp(a));
  const overflow = archivedCandidates.slice(LOCAL_ARCHIVE_MAX_TREES);
  for (const tree of overflow) {
    removalIds.add(tree.windowId);
  }

  if (!removalIds.size) {
    return;
  }

  await Promise.all(Array.from(removalIds).map((windowId) => removeWindowTree(windowId)));
}

async function collectRestoreTreePool() {
  const storedTrees = await loadAllWindowTrees();
  const snapshotTrees = Array.isArray(state.localSnapshot?.windows)
    ? state.localSnapshot.windows
    : [];
  const archivedTrees = Array.isArray(state.restoreArchive?.entries)
    ? state.restoreArchive.entries.map((entry) => ({
      ...entry.tree,
      restoreArchiveId: entry.id
    }))
    : [];
  return dedupeTreePool([...storedTrees, ...snapshotTrees, ...archivedTrees]);
}

async function hydrateWindow(windowId, tabs, options = {}) {
  const previous = options.previousTree || null;
  const previousScore = Number.isFinite(options.previousScore) ? options.previousScore : 0;
  const shouldAdoptRestoreArchiveId = !!previous
    && previousScore >= LOW_CONFIDENCE_RESTORE_SCORE
    && treeNodeCount(previous) === tabs.length;
  let tree;
  let source = "empty";

  if (tabs.length) {
    if (previous) {
      tree = buildTreeFromTabs(tabs, previous);
      source = "previous";
    } else {
      tree = inferTreeFromSyncSnapshot(windowId, tabs, state.syncSnapshot);
      if (tree) {
        source = "sync";
      } else {
        tree = buildTreeFromTabs(tabs);
        source = "flat";
      }
    }
  } else {
    tree = createEmptyWindowTree(windowId);
  }

  const hydrated = await treeWithCurrentGroupMetadata(windowId, tree);
  setWindowTree({
    ...hydrated,
    restoreScore: previousScore,
    restoreSource: source,
    restoreStartupPending: tabs.length > 0,
    restoreArchiveId: shouldAdoptRestoreArchiveId ? previous?.restoreArchiveId : null
  }, {
    restoreArchiveId: shouldAdoptRestoreArchiveId ? previous?.restoreArchiveId : null
  });

  return {
    source,
    score: previousScore
  };
}

async function attemptLowConfidenceRehydrate(windowId, candidatePool, options = {}) {
  if (!Number.isInteger(windowId)) {
    return;
  }
  const currentTree = state.windows[windowId];
  if (!currentTree) {
    return;
  }
  const isFinalAttempt = !!options.isFinalAttempt;

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ windowId });
  } catch {
    return;
  }
  if (!tabs.length) {
    return;
  }

  const currentScore = scorePreviousTreeAgainstTabs(currentTree, tabs);
  const currentRestoreScore = Number.isFinite(currentTree.restoreScore) ? currentTree.restoreScore : 0;
  const currentRestoreIsWeak = currentTree.restoreSource !== "previous"
    || currentRestoreScore < LOW_CONFIDENCE_RESTORE_SCORE;
  const startupPending = !!currentTree.restoreStartupPending;
  const candidates = (candidatePool || []).filter((tree) =>
    Number.isInteger(tree?.windowId) && tree?.nodes
  );

  let bestTree = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = scorePreviousTreeAgainstTabs(candidate, tabs);
    if (score > bestScore) {
      bestScore = score;
      bestTree = candidate;
    }
  }

  if (!bestTree || bestScore < LOW_CONFIDENCE_RESTORE_SCORE) {
    if (startupPending && isFinalAttempt) {
      setWindowTree({
        ...currentTree,
        restoreStartupPending: false
      }, {
        restoreArchiveId: currentTree.restoreArchiveId ?? null
      });
    }
    return;
  }
  if (!startupPending && !currentRestoreIsWeak && bestScore <= Math.max(currentScore, currentRestoreScore) + 2) {
    return;
  }

  const rebuilt = buildTreeFromTabs(tabs, bestTree);
  const withGroups = await treeWithCurrentGroupMetadata(windowId, rebuilt);
  setWindowTree({
    ...withGroups,
    restoreScore: bestScore,
    restoreSource: "previous",
    restoreStartupPending: !isFinalAttempt
  }, {
    restoreArchiveId: bestTree.restoreArchiveId ?? null
  });
}

function scheduleStartupReconcile(windowIds) {
  const targets = (windowIds || []).filter((id) => Number.isInteger(id));
  if (!targets.length) {
    return;
  }

  const finalDelayMs = STARTUP_RECONCILE_DELAYS_MS[STARTUP_RECONCILE_DELAYS_MS.length - 1] || 0;
  for (const delayMs of STARTUP_RECONCILE_DELAYS_MS) {
    setTimeout(() => {
      queueMutationFireAndForget(null, async () => {
        const candidatePool = await collectRestoreTreePool();
        for (const windowId of targets) {
          await attemptLowConfidenceRehydrate(windowId, candidatePool, {
            isFinalAttempt: delayMs === finalDelayMs
          });
        }
      }, {
        operation: "startup.reconcile",
        windowIds: targets,
        delayMs
      });
    }, delayMs);
  }
}

async function hydrateAllWindows(windows, previousTrees = []) {
  const openWindows = Array.isArray(windows) ? windows : [];
  const treePool = dedupeTreePool(previousTrees);
  const preassigned = assignBestPreviousTrees(openWindows, treePool);
  const reconcileWindows = [];

  for (const win of openWindows) {
    const tabs = win.tabs || [];
    const assigned = preassigned.get(win.id);
    const previousTree = assigned?.tree || null;
    const previousScore = assigned?.score || 0;

    const result = await hydrateWindow(win.id, tabs, {
      previousTree,
      previousScore
    });
    if (tabs.length && (result.source !== "empty")) {
      reconcileWindows.push(win.id);
    }
  }

  scheduleStartupReconcile(reconcileWindows);
}

const ensureInitialized = createInitCoordinator({
  isInitialized: () => state.initialized,
  initialize: async () => {
    state.settings = await loadSettings();
    state.syncSnapshot = await loadSyncSnapshot();
    state.localSnapshot = await loadLocalSnapshot();
    state.restoreArchive = await loadRestoreArchive();
    const windows = await chrome.windows.getAll({ populate: true });
    await pruneArchivedLocalTrees(windows.map((win) => win.id));
    const previousTrees = await collectRestoreTreePool();
    await hydrateAllWindows(windows, previousTrees);
    state.initialized = true;

    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch {
      // Best effort.
    }
  }
});

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
      } catch (error) {
        logUnexpectedFailure("batchCloseSubtrees.removeTabs", error, { windowId, tabIds: uniqueRemoveIds });
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
      } catch (error) {
        logUnexpectedFailure("batchCloseTabs.removeTabs", error, { windowId, tabIds: liveInWindow });
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
    } catch (error) {
      logUnexpectedFailure("batchGroupNew.groupTabs", error, { windowId, tabIds: uniqueTabIds });
    }

    await runWindowOrderingSyncNow(windowId);
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
  } catch (error) {
    logUnexpectedFailure("batchGroupExisting.groupTabs", error, {
      windowId: targetWindowId,
      groupId,
      tabIds: uniqueTabIds
    });
  }

  await runWindowOrderingSyncNow(targetWindowId);
  await refreshGroupMetadata(targetWindowId);
}

async function batchMoveToRoot(tabIds, options = {}) {
  const placement = options.placement === "before" || options.placement === "after"
    ? options.placement
    : null;
  const targetTabId = Number.isFinite(options.targetTabId) ? options.targetTabId : null;

  const grouped = await groupLiveTabIdsByWindowInRequestOrder(tabIds);
  const undoByWindow = [];
  for (const [windowId, orderedTabIds] of grouped.entries()) {
    const tree = windowTree(windowId);
    let orderedNodeIds = orderedTabIds
      .map((id) => nodeIdFromTabId(id))
      .filter((nodeId) => !!tree.nodes[nodeId]);
    if (!orderedNodeIds.length) {
      continue;
    }

    let targetNodeId = null;
    let hasRelativePlacement = false;
    let browserMoveIndex = -1;
    if (placement && Number.isFinite(targetTabId)) {
      const liveTargetTab = await getTab(targetTabId);
      if (!liveTargetTab || liveTargetTab.windowId !== windowId) {
        await runWindowOrderingSyncNow(windowId);
        continue;
      }
      targetNodeId = nodeIdFromTabId(targetTabId);
      const targetNode = tree.nodes[targetNodeId];
      if (targetNode && !targetNode.parentNodeId) {
        orderedNodeIds = orderedNodeIds.filter((nodeId) =>
          nodeId !== targetNodeId && !!tree.nodes[nodeId] && !!tree.nodes[nodeId].pinned === !!targetNode.pinned
        );
        hasRelativePlacement = true;

        let windowTabs = [];
        try {
          windowTabs = await chrome.tabs.query({ windowId });
        } catch {
          windowTabs = [];
        }
        const moveTabIds = orderedNodeIds
          .map((nodeId) => tree.nodes[nodeId]?.tabId)
          .filter((id) => Number.isFinite(id));
        browserMoveIndex = browserInsertionIndexForRelativePlacement(
          windowTabs,
          moveTabIds,
          targetTabId,
          placement
        );
      }
    }

    if (!orderedNodeIds.length) {
      continue;
    }

    const moveRecords = captureTabMoveRecords(
      tree,
      orderedNodeIds.map((nodeId) => tree.nodes[nodeId]?.tabId).filter((id) => Number.isFinite(id))
    );

    let next = tree;
    for (const nodeId of orderedNodeIds) {
      if (hasRelativePlacement && targetNodeId) {
        const siblings = next.rootNodeIds;
        const anchorIndex = siblings.indexOf(targetNodeId);
        if (anchorIndex < 0) {
          next = moveNode(next, nodeId, null, null);
          if (placement === "after") {
            targetNodeId = nodeId;
          }
          continue;
        }
        let newIndex = placement === "after" ? anchorIndex + 1 : anchorIndex;
        const oldIndex = siblings.indexOf(nodeId);
        if (oldIndex >= 0 && oldIndex < newIndex) {
          newIndex -= 1;
        }
        next = moveNode(next, nodeId, null, newIndex);
        if (placement === "after") {
          targetNodeId = nodeId;
        }
      } else {
        next = moveNode(next, nodeId, null, null);
      }
    }
    const moveTabIds = orderedNodeIds.map((nodeId) => next.nodes[nodeId]?.tabId).filter((id) => Number.isFinite(id));
    let movedInBrowser = !moveTabIds.length;
    if (moveTabIds.length) {
      if (hasRelativePlacement && Number.isFinite(targetTabId) && placement) {
        movedInBrowser = await moveTabsRelativeToTarget(windowId, moveTabIds, targetTabId, placement);
      } else {
        try {
          await chrome.tabs.move(moveTabIds, { index: browserMoveIndex });
          movedInBrowser = true;
        } catch (error) {
          logUnexpectedFailure("batchMoveToRoot.moveTabs", error, { windowId, tabIds: moveTabIds });
          movedInBrowser = false;
        }
      }
    }

    if (movedInBrowser) {
      setWindowTree(next);
      if (moveRecords.length) {
        const token = setLastMove(windowId, {
          kind: "tabs",
          records: moveRecords
        });
        if (token) {
          undoByWindow.push({ windowId, token });
        }
      }
    }
    await runWindowOrderingSyncNow(windowId);
  }

  return undoByWindow[0] || null;
}

async function batchReparent(tabIds, newParentTabId, options = {}) {
  const parentTab = await getTab(newParentTabId);
  if (!parentTab) {
    return;
  }

  const tree = windowTree(parentTab.windowId);
  const parentNodeId = nodeIdFromTabId(newParentTabId);
  if (!tree.nodes[parentNodeId]) {
    return;
  }

  const uniqueRequestedTabIds = uniqueFiniteTabIdsInOrder(tabIds);
  const tabs = await Promise.all(uniqueRequestedTabIds.map((tabId) => getTab(tabId)));
  const sameWindowTabIds = tabs
    .filter((tab) => tab && tab.windowId === parentTab.windowId && tab.id !== newParentTabId)
    .map((tab) => tab.id);

  let orderedNodeIds = sameWindowTabIds
    .map((id) => nodeIdFromTabId(id))
    .filter((id) => !!tree.nodes[id]);
  if (!orderedNodeIds.length) {
    return;
  }

  const targetTabId = Number.isFinite(options.targetTabId) ? options.targetTabId : null;
  const placement = options.placement === "inside" || options.placement === "before" || options.placement === "after"
    ? options.placement
    : null;

  const reparentableNodeIds = orderedNodeIds.filter((nodeId) => canReparent(tree, nodeId, parentNodeId));
  if (!reparentableNodeIds.length) {
    return;
  }

  const moveRecords = captureTabMoveRecords(
    tree,
    reparentableNodeIds.map((nodeId) => tree.nodes[nodeId]?.tabId).filter((id) => Number.isFinite(id))
  );

  let browserMoveIndex = childInsertIndex(tree, parentNodeId, parentTab.index + 1);
  let targetNodeId = null;
  let hasRelativePlacement = false;

  if (placement === "inside") {
    // Default append behavior is kept for inside moves.
  } else if ((placement === "before" || placement === "after") && Number.isFinite(targetTabId)) {
    const liveTargetTab = await getTab(targetTabId);
    if (!liveTargetTab || liveTargetTab.windowId !== parentTab.windowId) {
      await runWindowOrderingSyncNow(parentTab.windowId);
      return null;
    }
    targetNodeId = nodeIdFromTabId(targetTabId);
    const targetNode = tree.nodes[targetNodeId];
    const targetIsSibling = !!targetNode
      && targetNode.parentNodeId === parentNodeId
      && !reparentableNodeIds.includes(targetNodeId);

    if (targetIsSibling) {
      hasRelativePlacement = true;

      let windowTabs = [];
      try {
        windowTabs = await chrome.tabs.query({ windowId: parentTab.windowId });
      } catch {
        windowTabs = [];
      }
      const moveTabIds = reparentableNodeIds
        .map((nodeId) => tree.nodes[nodeId]?.tabId)
        .filter((id) => Number.isFinite(id));
      browserMoveIndex = browserInsertionIndexForRelativePlacement(
        windowTabs,
        moveTabIds,
        targetTabId,
        placement
      );
    }
  }

  let next = tree;
  for (const sourceNodeId of reparentableNodeIds) {
    if (hasRelativePlacement && targetNodeId) {
      const siblings = next.nodes[parentNodeId]?.childNodeIds || [];
      const anchorIndex = siblings.indexOf(targetNodeId);
      if (anchorIndex < 0) {
        next = moveNode(next, sourceNodeId, parentNodeId, null);
        if (placement === "after") {
          targetNodeId = sourceNodeId;
        }
        continue;
      }
      let newIndex = placement === "after" ? anchorIndex + 1 : anchorIndex;
      const oldIndex = siblings.indexOf(sourceNodeId);
      if (oldIndex >= 0 && oldIndex < newIndex) {
        newIndex -= 1;
      }
      next = moveNode(next, sourceNodeId, parentNodeId, newIndex);
      if (placement === "after") {
        targetNodeId = sourceNodeId;
      }
    } else {
      next = moveNode(next, sourceNodeId, parentNodeId, null);
    }
  }
  const moveTabIds = reparentableNodeIds.map((id) => next.nodes[id]?.tabId).filter((id) => Number.isFinite(id));
  let movedInBrowser = !moveTabIds.length;
  if (moveTabIds.length) {
    if (hasRelativePlacement && Number.isFinite(targetTabId) && placement) {
      movedInBrowser = await moveTabsRelativeToTarget(parentTab.windowId, moveTabIds, targetTabId, placement);
    } else {
      try {
        await chrome.tabs.move(moveTabIds, { index: browserMoveIndex });
        movedInBrowser = true;
      } catch (error) {
        logUnexpectedFailure("batchReparent.moveTabs", error, {
          windowId: parentTab.windowId,
          tabIds: moveTabIds,
          parentTabId: newParentTabId
        });
        movedInBrowser = false;
      }
    }
  }

  if (movedInBrowser) {
    setWindowTree(next);
  }

  if (movedInBrowser && Number.isInteger(parentTab.groupId) && parentTab.groupId >= 0 && moveTabIds.length) {
    try {
      await chrome.tabs.group({ groupId: parentTab.groupId, tabIds: moveTabIds });
    } catch (error) {
      logUnexpectedFailure("batchReparent.groupTabs", error, {
        windowId: parentTab.windowId,
        groupId: parentTab.groupId,
        tabIds: moveTabIds
      });
    }
  }

  await runWindowOrderingSyncNow(parentTab.windowId);

  if (movedInBrowser && moveRecords.length) {
    const token = setLastMove(parentTab.windowId, {
      kind: "tabs",
      records: moveRecords
    });
    if (token) {
      return {
        windowId: parentTab.windowId,
        token
      };
    }
  }

  return null;
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
  const previousIndex = sourceTabs[0].index;

  if (Number.isFinite(payload.targetTabId) && sourceTabIds.includes(payload.targetTabId)) {
    return;
  }
  if (Number.isFinite(payload.targetTabId) && !tabs.some((tab) => tab.id === payload.targetTabId)) {
    await runWindowOrderingSyncNow(windowId);
    return null;
  }
  if (Number.isFinite(payload.targetGroupId) && payload.targetGroupId === sourceGroupId) {
    return;
  }
  if (Number.isFinite(payload.targetGroupId) && !tabs.some((tab) => tab.groupId === payload.targetGroupId)) {
    await runWindowOrderingSyncNow(windowId);
    return null;
  }

  const index = insertionIndexForGroupMove(tabs, sourceTabIds, payload);
  let moved = false;
  try {
    await chrome.tabGroups.move(sourceGroupId, { index });
    moved = true;
  } catch (error) {
    logUnexpectedFailure("moveGroupBlock.moveGroup", error, {
      windowId,
      sourceGroupId,
      index
    });
    // Fallback to tab move when group move fails.
  }

  if (!moved) {
    try {
      await chrome.tabs.move(sourceTabIds, { index });
      moved = true;
    } catch (error) {
      logUnexpectedFailure("moveGroupBlock.moveTabsFallback", error, {
        windowId,
        sourceGroupId,
        tabIds: sourceTabIds,
        index
      });
      return null;
    }
  }

  // Safety net: ensure all source tabs still belong to the source group after move.
  try {
    await chrome.tabs.group({ groupId: sourceGroupId, tabIds: sourceTabIds });
  } catch (error) {
    logUnexpectedFailure("moveGroupBlock.regroupTabs", error, {
      windowId,
      sourceGroupId,
      tabIds: sourceTabIds
    });
  }

  await runWindowOrderingSyncNow(windowId);
  await refreshGroupMetadata(windowId);
  const token = setLastMove(windowId, {
    kind: "group-block",
    sourceGroupId,
    previousIndex
  });
  return token ? { windowId, token } : null;
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
  } catch (error) {
    logUnexpectedFailure("renameGroup.update", error, { groupId, title: title.trim() });
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

async function resolveWindowIdFromTabId(tabId) {
  if (!Number.isInteger(tabId)) {
    return null;
  }
  const tab = await getTab(tabId);
  return Number.isInteger(tab?.windowId) ? tab.windowId : null;
}

async function resolveWindowIdFromGroupId(groupId) {
  if (!Number.isInteger(groupId)) {
    return null;
  }
  return resolveGroupWindowId(groupId, null);
}

async function resolveWindowIdForUndoAction(payload) {
  if (Number.isInteger(payload?.windowId)) {
    return payload.windowId;
  }
  const active = await getActiveTab();
  return Number.isInteger(active?.windowId) ? active.windowId : null;
}

async function runToggleCollapseAction(payload) {
  const tab = await getTab(payload.tabId);
  if (!tab) {
    return null;
  }
  const tree = windowTree(tab.windowId);
  setWindowTree(toggleNodeCollapsed(tree, nodeIdFromTabId(payload.tabId)));
  return null;
}

async function runReparentTabAction(payload) {
  const tab = await getTab(payload.tabId);
  if (!tab) {
    return null;
  }
  const tree = windowTree(tab.windowId);
  const nodeId = nodeIdFromTabId(payload.tabId);

  const moveRecord = captureTabMoveRecord(tree, payload.tabId);
  const moved = await handleReparentTabAction({ payload, tab, tree, nodeId }, {
    nodeIdFromTabId,
    canReparent,
    moveNode,
    sortTreeByIndex,
    resolveBrowserMoveIndex,
    moveTab: (tabId, index) => chrome.tabs.move(tabId, { index }),
    logUnexpectedFailure,
    setWindowTree,
    getTab,
    groupTabs: (groupId, tabIds) => chrome.tabs.group({ groupId, tabIds }),
    syncWindowOrdering: runWindowOrderingSyncNow
  });
  if (moved && moveRecord) {
    const token = setLastMove(tab.windowId, {
      kind: "tabs",
      records: [moveRecord]
    });
    if (token) {
      return { undo: { windowId: tab.windowId, token } };
    }
  }
  return null;
}

async function runMoveToRootTreeAction(payload) {
  const tab = await getTab(payload.tabId);
  if (!tab) {
    return null;
  }
  const tree = windowTree(tab.windowId);
  const nodeId = nodeIdFromTabId(payload.tabId);

  const moveRecord = captureTabMoveRecord(tree, payload.tabId);
  const moved = await handleMoveToRootAction({ payload, tab, tree, nodeId }, {
    moveNode,
    sortTreeByIndex,
    resolveBrowserMoveIndex,
    moveTab: (tabId, index) => chrome.tabs.move(tabId, { index }),
    logUnexpectedFailure,
    setWindowTree,
    syncWindowOrdering: runWindowOrderingSyncNow
  });
  if (moved && moveRecord) {
    const token = setLastMove(tab.windowId, {
      kind: "tabs",
      records: [moveRecord]
    });
    if (token) {
      return { undo: { windowId: tab.windowId, token } };
    }
  }
  return null;
}

const TREE_ACTION_HANDLER_REGISTRY = Object.freeze({
  [TREE_ACTIONS.ADD_CHILD_TAB]: {
    resolveWindowId: (payload) => resolveWindowIdFromTabId(payload.parentTabId),
    run: async (payload) => {
      await addChildTab(payload.parentTabId);
      return null;
    }
  },
  [TREE_ACTIONS.REPARENT_TAB]: {
    resolveWindowId: (payload) => resolveWindowIdFromTabId(payload.tabId),
    run: runReparentTabAction
  },
  [TREE_ACTIONS.MOVE_TO_ROOT]: {
    resolveWindowId: (payload) => resolveWindowIdFromTabId(payload.tabId),
    run: runMoveToRootTreeAction
  },
  [TREE_ACTIONS.TOGGLE_COLLAPSE]: {
    resolveWindowId: (payload) => resolveWindowIdFromTabId(payload.tabId),
    run: runToggleCollapseAction
  },
  [TREE_ACTIONS.TOGGLE_GROUP_COLLAPSE]: {
    resolveWindowId: (payload) => resolveWindowIdFromGroupId(payload.groupId),
    run: async (payload) => {
      await handleToggleGroupCollapseAction(payload, {
        resolveGroupWindowId,
        windowTree,
        updateGroupCollapsed: (groupId, collapsed) => chrome.tabGroups.update(groupId, { collapsed }),
        refreshGroupMetadata
      });
      return null;
    }
  },
  [TREE_ACTIONS.CLOSE_SUBTREE]: {
    resolveWindowId: (payload) => resolveWindowIdFromTabId(payload.tabId),
    run: async (payload) => {
      await handleCloseSubtreeAction(payload, {
        getTab,
        closeSubtree,
        nodeIdFromTabId,
        resolveStaleWindowIdByNodeId,
        removeTabIdsFromWindowTree,
        pruneWindowTreeAgainstLiveTabs
      });
      return null;
    }
  },
  [TREE_ACTIONS.ACTIVATE_TAB]: {
    resolveWindowId: (payload) => resolveWindowIdFromTabId(payload.tabId),
    run: async (payload) => {
      await activateTab(payload.tabId);
      return null;
    }
  },
  [TREE_ACTIONS.BATCH_CLOSE_TABS]: {
    run: async (payload) => {
      await batchCloseTabs(payload.tabIds || []);
      return null;
    }
  },
  [TREE_ACTIONS.BATCH_GROUP_NEW]: {
    run: async (payload) => {
      await batchGroupNew(payload.tabIds || []);
      return null;
    }
  },
  [TREE_ACTIONS.BATCH_GROUP_EXISTING]: {
    resolveWindowId: (payload) => resolveWindowIdFromGroupId(payload.groupId),
    run: async (payload) => {
      await batchGroupExisting(payload.tabIds || [], payload.groupId, payload.windowId ?? null);
      return null;
    }
  },
  [TREE_ACTIONS.BATCH_CLOSE_SUBTREES]: {
    run: async (payload) => {
      await batchCloseSubtrees(payload.tabIds || []);
      return null;
    }
  },
  [TREE_ACTIONS.BATCH_MOVE_TO_ROOT]: {
    run: async (payload) => {
      const undo = await batchMoveToRoot(payload.tabIds || [], {
        placement: payload.placement,
        targetTabId: payload.targetTabId
      });
      return undo ? { undo } : null;
    }
  },
  [TREE_ACTIONS.BATCH_REPARENT]: {
    resolveWindowId: (payload) => resolveWindowIdFromTabId(payload.newParentTabId),
    run: async (payload) => {
      const undo = await batchReparent(payload.tabIds || [], payload.newParentTabId, {
        placement: payload.placement,
        targetTabId: payload.targetTabId
      });
      return undo ? { undo } : null;
    }
  },
  [TREE_ACTIONS.UNDO_LAST_TREE_MOVE]: {
    resolveWindowId: resolveWindowIdForUndoAction,
    run: async (payload) => {
      const result = await undoLastTreeMove(payload.windowId ?? null, payload.token ?? null);
      return result?.undone ? { undone: true, windowId: result.windowId } : null;
    }
  },
  [TREE_ACTIONS.MOVE_GROUP_BLOCK]: {
    resolveWindowId: (payload) => resolveWindowIdFromGroupId(payload.sourceGroupId),
    run: async (payload) => {
      const undo = await moveGroupBlock(payload);
      return undo ? { undo } : null;
    }
  },
  [TREE_ACTIONS.RENAME_GROUP]: {
    resolveWindowId: (payload) => resolveWindowIdFromGroupId(payload.groupId),
    run: async (payload) => {
      await renameGroup(payload.groupId, payload.title || "", payload.windowId ?? null);
      return null;
    }
  },
  [TREE_ACTIONS.SET_GROUP_COLOR]: {
    resolveWindowId: (payload) => resolveWindowIdFromGroupId(payload.groupId),
    run: async (payload) => {
      await setGroupColor(payload.groupId, payload.color, payload.windowId ?? null, payload.tabIds || []);
      return null;
    }
  }
});

function resolveTreeActionHandler(type) {
  if (!isTreeActionType(type)) {
    return null;
  }
  return TREE_ACTION_HANDLER_REGISTRY[type] || null;
}

async function handleTreeAction(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const { type } = safePayload;
  const handler = resolveTreeActionHandler(type);
  if (!handler) {
    throw createActionError(
      ACTION_ERROR_CODES.UNSUPPORTED_TREE_ACTION,
      `Unsupported tree action type: ${String(type)}`,
      { actionType: String(type) }
    );
  }

  try {
    return await handler.run(safePayload);
  } catch (error) {
    if (error instanceof Error && !error.actionType) {
      error.actionType = type;
    }
    throw error;
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
  if (!parent) {
    return;
  }
  const grandParentId = parent?.parentNodeId || null;
  const siblings = grandParentId ? (tree.nodes[grandParentId]?.childNodeIds || []) : tree.rootNodeIds;
  const parentPosition = siblings.indexOf(parent.nodeId);
  const targetIndex = parentPosition >= 0 ? parentPosition + 1 : null;
  const fallbackIndex = Number.isFinite(parent.index) ? parent.index + 1 : active.index;
  const browserIndex = childInsertIndex(tree, parent.nodeId, fallbackIndex);

  try {
    await chrome.tabs.move(active.id, { index: browserIndex });
  } catch {
    await runWindowOrderingSyncNow(active.windowId);
    return;
  }

  setWindowTree(moveNode(tree, node.nodeId, grandParentId, targetIndex));
  await runWindowOrderingSyncNow(active.windowId);
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
  const previousRootNode = tree.nodes[previousRoot];
  if (!previousRootNode || !!previousRootNode.pinned !== !!node.pinned) {
    return;
  }
  const fallbackIndex = Number.isFinite(previousRootNode.index) ? previousRootNode.index + 1 : active.index;
  const browserIndex = childInsertIndex(tree, previousRoot, fallbackIndex);

  try {
    await chrome.tabs.move(active.id, { index: browserIndex });
  } catch {
    await runWindowOrderingSyncNow(active.windowId);
    return;
  }

  setWindowTree(moveNode(tree, nodeId, previousRoot));
  await runWindowOrderingSyncNow(active.windowId);
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

function requestSidePanelSearchFocus() {
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.FOCUS_SEARCH
  }).catch(() => {
    // Side panel not open yet.
  });
}

function queueMutationFireAndForget(windowId, operation, context = {}) {
  void queueMutation(windowId, operation, context).catch((error) => {
    logUnexpectedFailure(context.operation || "queuedMutation", error, context);
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInitialized();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureInitialized();
});

chrome.runtime.onSuspend.addListener(() => {
  orderSyncCoordinator.dispose();
  void persistCoordinator.flushNow();
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
      state.settings = await queueMutation(null, async () => {
        return saveSettings({ ...state.settings, ...message.payload.settingsPatch });
      }, { operation: "settings.patch" });
      broadcastState(null, null, false);
      sendResponse({ ok: true, payload: state.settings });
      return;
    }

    if (message?.type === MESSAGE_TYPES.TREE_ACTION) {
      const payload = message.payload || {};
      const actionType = payload.type;
      const actionWindowId = await resolveTreeActionWindowId(payload);
      try {
        const result = await queueMutation(actionWindowId, async () => {
          return handleTreeAction(payload);
        }, {
          operation: "treeAction",
          actionType,
          windowId: actionWindowId
        });
        sendResponse({ ok: true, payload: result });
      } catch (error) {
        const fallbackCode = actionType && !isTreeActionType(actionType)
          ? ACTION_ERROR_CODES.UNSUPPORTED_TREE_ACTION
          : ACTION_ERROR_CODES.TREE_ACTION_FAILED;
        sendResponse({
          ok: false,
          error: toActionErrorPayload(error, fallbackCode, {
            actionType,
            windowId: actionWindowId
          })
        });
      }
      return;
    }

    if (message?.type === MESSAGE_TYPES.FOCUS_SEARCH) {
      sendResponse({ ok: true });
      return;
    }

    sendResponse({
      ok: false,
      error: toActionErrorPayload(
        createActionError(ACTION_ERROR_CODES.UNKNOWN_MESSAGE_TYPE, "Unknown message type"),
        ACTION_ERROR_CODES.UNKNOWN_MESSAGE_TYPE
      )
    });
  })().catch((err) => {
    sendResponse({
      ok: false,
      error: toActionErrorPayload(err, ACTION_ERROR_CODES.MESSAGE_HANDLER_FAILED, {
        actionType: message?.payload?.type
      })
    });
  });

  return true;
});

chrome.tabs.onCreated.addListener((tab) => {
  queueMutationFireAndForget(tab.windowId, async () => {
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
  }, {
    operation: "tabs.onCreated",
    tabId: tab.id,
    windowId: tab.windowId
  });
});

chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  const windowId = Number.isInteger(tab?.windowId) ? tab.windowId : null;
  queueMutationFireAndForget(windowId, async () => {
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
    if (tab.active) {
      await ensureSelectedTabVisible(tab.windowId, tabId);
    }
  }, {
    operation: "tabs.onUpdated",
    tabId,
    windowId
  });
});

chrome.tabs.onMoved.addListener((tabId) => {
  queueMutationFireAndForget(null, async () => {
    await ensureInitialized();
    const tab = await getTab(tabId);
    if (!tab) {
      return;
    }
    scheduleWindowOrderingSync(tab.windowId);
  }, {
    operation: "tabs.onMoved",
    tabId
  });
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  queueMutationFireAndForget(windowId, async () => {
    await ensureInitialized();
    const tree = windowTree(windowId);
    setWindowTree(setActiveTab(tree, tabId));
    await ensureSelectedTabVisible(windowId, tabId);
  }, {
    operation: "tabs.onActivated",
    tabId,
    windowId
  });
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  queueMutationFireAndForget(removeInfo.windowId, async () => {
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
    scheduleWindowOrderingSync(removeInfo.windowId);
  }, {
    operation: "tabs.onRemoved",
    tabId,
    windowId: removeInfo.windowId
  });
});

chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  queueMutationFireAndForget(attachInfo.newWindowId, async () => {
    await ensureInitialized();
    const tab = await getTab(tabId);
    if (!tab) {
      return;
    }
    const tree = windowTree(attachInfo.newWindowId);
    setWindowTree(upsertTabNode(tree, tab));
  }, {
    operation: "tabs.onAttached",
    tabId,
    windowId: attachInfo.newWindowId
  });
});

chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
  queueMutationFireAndForget(detachInfo.oldWindowId, async () => {
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
    scheduleWindowOrderingSync(detachInfo.oldWindowId);
  }, {
    operation: "tabs.onDetached",
    tabId,
    windowId: detachInfo.oldWindowId
  });
});

chrome.windows.onRemoved.addListener((windowId) => {
  queueMutationFireAndForget(windowId, async () => {
    await ensureInitialized();
    await archiveWindowTree(windowId);
    delete state.windows[windowId];
    delete state.restoreArchiveIds[windowId];
    clearLastMove(windowId);
    persistCoordinator.forgetWindow(windowId);
    orderSyncCoordinator.cancel(windowId);
    broadcastState();
  }, {
    operation: "windows.onRemoved",
    windowId
  });
});

chrome.tabGroups.onCreated.addListener((group) => {
  queueMutationFireAndForget(null, async () => {
    await ensureInitialized();
    const windowId = await resolveGroupWindowIdFromEvent(group);
    if (Number.isInteger(windowId)) {
      await queueMutation(windowId, async () => {
        await refreshGroupMetadata(windowId);
      }, {
        operation: "tabGroups.onCreated.refreshGroupMetadata",
        groupId: group?.id,
        windowId
      });
    }
  }, {
    operation: "tabGroups.onCreated",
    groupId: group?.id
  });
});

chrome.tabGroups.onUpdated.addListener((group) => {
  queueMutationFireAndForget(null, async () => {
    await ensureInitialized();
    const windowId = await resolveGroupWindowIdFromEvent(group);
    if (Number.isInteger(windowId)) {
      scheduleWindowOrderingSync(windowId);
    }
  }, {
    operation: "tabGroups.onUpdated",
    groupId: group?.id
  });
});

chrome.tabGroups.onMoved.addListener((group) => {
  queueMutationFireAndForget(null, async () => {
    await ensureInitialized();
    const windowId = await resolveGroupWindowIdFromEvent(group);
    if (Number.isInteger(windowId)) {
      scheduleWindowOrderingSync(windowId);
    }
  }, {
    operation: "tabGroups.onMoved",
    groupId: group?.id
  });
});

chrome.tabGroups.onRemoved.addListener((group) => {
  queueMutationFireAndForget(null, async () => {
    await ensureInitialized();
    const windowId = await resolveGroupWindowIdFromEvent(group);
    if (Number.isInteger(windowId)) {
      await queueMutation(windowId, async () => {
        await refreshGroupMetadata(windowId);
      }, {
        operation: "tabGroups.onRemoved.refreshGroupMetadata",
        groupId: group?.id,
        windowId
      });
    }
  }, {
    operation: "tabGroups.onRemoved",
    groupId: group?.id
  });
});

chrome.commands.onCommand.addListener((command) => {
  queueMutationFireAndForget(null, async () => {
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

    if (command === "focus-search") {
      await focusSidePanel();
      requestSidePanelSearchFocus();
      setTimeout(requestSidePanelSearchFocus, 150);
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
  }, {
    operation: "commands.onCommand",
    command
  });
});

void ensureInitialized();
