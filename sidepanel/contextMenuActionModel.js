import { TREE_ACTIONS } from "../shared/constants.js";

function defaultNodeIdFromTabId(tabId) {
  return `tab:${tabId}`;
}

function uniqueFiniteTabIds(tabIds) {
  return Array.from(new Set((tabIds || []).filter((tabId) => Number.isFinite(tabId))));
}

function parseExistingGroupAction(action) {
  if (typeof action !== "string" || !action.startsWith("group-selected-existing:")) {
    return null;
  }
  const groupId = Number(action.slice("group-selected-existing:".length));
  return Number.isInteger(groupId) ? groupId : null;
}

function scopedUrls(tree, tabIds, nodeIdFromTabId) {
  return uniqueFiniteTabIds(tabIds)
    .map((tabId) => tree.nodes[nodeIdFromTabId(tabId)]?.lastKnownUrl || "")
    .filter((url) => typeof url === "string" && url.trim().length > 0);
}

function hasGroupedTabs(tree, tabIds, nodeIdFromTabId) {
  return uniqueFiniteTabIds(tabIds).some(
    (tabId) => tree.nodes[nodeIdFromTabId(tabId)]?.groupId !== null
  );
}

export function deriveContextMenuActionIntent({
  action,
  tree,
  contextMenu,
  groupTabIds,
  nodeIdFromTabId = defaultNodeIdFromTabId
}) {
  if (!tree || !contextMenu || typeof groupTabIds !== "function") {
    return { kind: "noop", shouldCloseMenu: false };
  }

  if (action === "rename-group") {
    return { kind: "open-rename-group", shouldCloseMenu: false };
  }

  if (action === "close-group") {
    const tabIds = uniqueFiniteTabIds(groupTabIds(tree, contextMenu.groupId));
    return {
      kind: "request-close",
      shouldCloseMenu: true,
      closeAction: { kind: "batch-tabs", tabIds },
      totalTabs: tabIds.length,
      isBatch: true
    };
  }

  if (action === "close-selected-tabs") {
    const tabIds = uniqueFiniteTabIds(contextMenu.scopeTabIds);
    return {
      kind: "request-close",
      shouldCloseMenu: true,
      closeAction: { kind: "batch-tabs", tabIds },
      totalTabs: tabIds.length,
      isBatch: true
    };
  }

  if (action === "group-selected-new") {
    const tabIds = uniqueFiniteTabIds(contextMenu.scopeTabIds);
    if (!tabIds.length || hasGroupedTabs(tree, tabIds, nodeIdFromTabId)) {
      return { kind: "noop", shouldCloseMenu: true };
    }
    return {
      kind: "tree-action",
      shouldCloseMenu: true,
      payload: {
        type: TREE_ACTIONS.BATCH_GROUP_NEW,
        tabIds
      }
    };
  }

  const existingGroupId = parseExistingGroupAction(action);
  if (existingGroupId !== null) {
    const tabIds = uniqueFiniteTabIds(contextMenu.scopeTabIds);
    if (!tabIds.length) {
      return { kind: "noop", shouldCloseMenu: true };
    }
    return {
      kind: "tree-action",
      shouldCloseMenu: true,
      payload: {
        type: TREE_ACTIONS.BATCH_GROUP_EXISTING,
        tabIds,
        groupId: existingGroupId,
        windowId: contextMenu.windowId
      }
    };
  }

  if (action === "add-child") {
    const tabId = contextMenu.primaryTabId;
    if (!Number.isFinite(tabId)) {
      return { kind: "noop", shouldCloseMenu: true };
    }
    return {
      kind: "tree-action",
      shouldCloseMenu: true,
      payload: {
        type: TREE_ACTIONS.ADD_CHILD_TAB,
        parentTabId: tabId
      }
    };
  }

  if (action === "move-selected-root") {
    const tabIds = uniqueFiniteTabIds(contextMenu.scopeTabIds);
    if (!tabIds.length) {
      return { kind: "noop", shouldCloseMenu: true };
    }
    return {
      kind: "tree-action",
      shouldCloseMenu: true,
      payload: {
        type: TREE_ACTIONS.BATCH_MOVE_TO_ROOT,
        tabIds
      }
    };
  }

  if (action === "toggle-collapse") {
    const tabId = contextMenu.primaryTabId;
    if (!Number.isFinite(tabId)) {
      return { kind: "noop", shouldCloseMenu: true };
    }
    return {
      kind: "tree-action",
      shouldCloseMenu: true,
      payload: {
        type: TREE_ACTIONS.TOGGLE_COLLAPSE,
        tabId
      }
    };
  }

  if (action === "copy-urls") {
    const urls = scopedUrls(tree, contextMenu.scopeTabIds, nodeIdFromTabId);
    return {
      kind: "copy-urls",
      shouldCloseMenu: true,
      text: urls.join("\n")
    };
  }

  return { kind: "noop", shouldCloseMenu: false };
}

