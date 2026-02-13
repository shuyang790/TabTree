import test from "node:test";
import assert from "node:assert/strict";
import { TREE_ACTIONS } from "../shared/constants.js";
import { deriveContextMenuActionIntent } from "../sidepanel/contextMenuActionModel.js";

function sampleTree() {
  return {
    nodes: {
      "tab:1": { tabId: 1, groupId: null, lastKnownUrl: "https://a.test" },
      "tab:2": { tabId: 2, groupId: 20, lastKnownUrl: "https://b.test" },
      "tab:3": { tabId: 3, groupId: null, lastKnownUrl: "" }
    }
  };
}

function sampleContextMenu() {
  return {
    scopeTabIds: [1, 2, 3],
    primaryTabId: 1,
    groupId: 20,
    windowId: 77
  };
}

function groupTabIds(_tree, groupId) {
  return groupId === 20 ? [2] : [];
}

test("rename-group intent keeps menu open and switches to rename mode", () => {
  const intent = deriveContextMenuActionIntent({
    action: "rename-group",
    tree: sampleTree(),
    contextMenu: sampleContextMenu(),
    groupTabIds
  });
  assert.deepEqual(intent, {
    kind: "open-rename-group",
    shouldCloseMenu: false
  });
});

test("close-group intent builds batch-tabs close action", () => {
  const intent = deriveContextMenuActionIntent({
    action: "close-group",
    tree: sampleTree(),
    contextMenu: sampleContextMenu(),
    groupTabIds
  });
  assert.deepEqual(intent, {
    kind: "request-close",
    shouldCloseMenu: true,
    closeAction: { kind: "batch-tabs", tabIds: [2] },
    totalTabs: 1,
    isBatch: true
  });
});

test("group-selected-existing action parses group id and builds tree action payload", () => {
  const intent = deriveContextMenuActionIntent({
    action: "group-selected-existing:33",
    tree: sampleTree(),
    contextMenu: sampleContextMenu(),
    groupTabIds
  });
  assert.deepEqual(intent, {
    kind: "tree-action",
    shouldCloseMenu: true,
    payload: {
      type: TREE_ACTIONS.BATCH_GROUP_EXISTING,
      tabIds: [1, 2, 3],
      groupId: 33,
      windowId: 77
    }
  });
});

test("group-selected-new becomes noop when selection already contains grouped tabs", () => {
  const intent = deriveContextMenuActionIntent({
    action: "group-selected-new",
    tree: sampleTree(),
    contextMenu: sampleContextMenu(),
    groupTabIds
  });
  assert.deepEqual(intent, {
    kind: "noop",
    shouldCloseMenu: true
  });
});

test("copy-urls action returns newline-joined scoped URLs", () => {
  const intent = deriveContextMenuActionIntent({
    action: "copy-urls",
    tree: sampleTree(),
    contextMenu: sampleContextMenu(),
    groupTabIds
  });
  assert.deepEqual(intent, {
    kind: "copy-urls",
    shouldCloseMenu: true,
    text: "https://a.test\nhttps://b.test"
  });
});

