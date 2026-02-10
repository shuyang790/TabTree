import test from "node:test";
import assert from "node:assert/strict";

import { shouldProcessTabUpdate } from "../background/tabUpdates.js";
import { nodeIdFromTabId } from "../shared/treeModel.js";

function makeTreeNode(tabId, overrides = {}) {
  return {
    nodeId: nodeIdFromTabId(tabId),
    tabId,
    pinned: false,
    groupId: null,
    index: 0,
    windowId: 1,
    active: false,
    lastKnownTitle: `Tab ${tabId}`,
    lastKnownUrl: `https://example.com/${tabId}`,
    favIconUrl: "",
    ...overrides
  };
}

test("shouldProcessTabUpdate returns true for unseen tab nodes", () => {
  const tree = {
    selectedTabId: null,
    nodes: {}
  };
  const tab = {
    id: 1,
    windowId: 1,
    index: 0,
    active: false,
    pinned: false,
    groupId: -1,
    title: "Tab 1",
    url: "https://example.com/1",
    favIconUrl: ""
  };

  assert.equal(shouldProcessTabUpdate(tree, 1, tab), true);
});

test("shouldProcessTabUpdate returns false when effective values are unchanged", () => {
  const node = makeTreeNode(2, { index: 3, active: true });
  const tree = {
    selectedTabId: 2,
    nodes: {
      [node.nodeId]: node
    }
  };
  const tab = {
    id: 2,
    windowId: 1,
    index: 3,
    active: true,
    pinned: false,
    groupId: -1,
    title: "Tab 2",
    url: "https://example.com/2",
    favIconUrl: ""
  };

  assert.equal(shouldProcessTabUpdate(tree, 2, tab), false);
});

test("shouldProcessTabUpdate returns true when active tab selection changes", () => {
  const node = makeTreeNode(3, { active: true });
  const tree = {
    selectedTabId: 1,
    nodes: {
      [node.nodeId]: node
    }
  };
  const tab = {
    id: 3,
    windowId: 1,
    index: 0,
    active: true,
    pinned: false,
    groupId: -1,
    title: "Tab 3",
    url: "https://example.com/3",
    favIconUrl: ""
  };

  assert.equal(shouldProcessTabUpdate(tree, 3, tab), true);
});

test("shouldProcessTabUpdate returns true when pinned/group/url fields change", () => {
  const node = makeTreeNode(4, {
    pinned: false,
    groupId: null,
    lastKnownUrl: "https://example.com/4"
  });
  const tree = {
    selectedTabId: 4,
    nodes: {
      [node.nodeId]: node
    }
  };
  const tab = {
    id: 4,
    windowId: 1,
    index: 0,
    active: false,
    pinned: true,
    groupId: 9,
    title: "Tab 4",
    url: "https://example.com/4-updated",
    favIconUrl: ""
  };

  assert.equal(shouldProcessTabUpdate(tree, 4, tab), true);
});
