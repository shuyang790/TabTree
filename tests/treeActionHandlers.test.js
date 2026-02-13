import test from "node:test";
import assert from "node:assert/strict";
import {
  handleCloseSubtreeAction,
  handleMoveToRootAction,
  handleReparentTabAction,
  handleToggleGroupCollapseAction
} from "../background/treeActionHandlers.js";

test("handleToggleGroupCollapseAction resolves target window and applies collapsed state", async () => {
  const calls = [];
  await handleToggleGroupCollapseAction(
    { groupId: 12, windowId: 44 },
    {
      resolveGroupWindowId: async () => 44,
      windowTree: () => ({ groups: { 12: { collapsed: false } } }),
      updateGroupCollapsed: async (groupId, collapsed) => {
        calls.push(["update", groupId, collapsed]);
      },
      refreshGroupMetadata: async (windowId) => {
        calls.push(["refresh", windowId]);
      }
    }
  );

  assert.deepEqual(calls, [
    ["update", 12, true],
    ["refresh", 44]
  ]);
});

test("handleCloseSubtreeAction closes live subtree and falls back to stale cleanup", async () => {
  const liveCalls = [];
  await handleCloseSubtreeAction(
    { tabId: 99, includeDescendants: false },
    {
      getTab: async () => ({ windowId: 5 }),
      closeSubtree: async (...args) => {
        liveCalls.push(args);
      },
      nodeIdFromTabId: (tabId) => `tab:${tabId}`,
      resolveStaleWindowIdByNodeId: () => null,
      removeTabIdsFromWindowTree: () => {},
      pruneWindowTreeAgainstLiveTabs: async () => {}
    }
  );
  assert.deepEqual(liveCalls, [[5, 99, false]]);

  const staleCalls = [];
  await handleCloseSubtreeAction(
    { tabId: 42 },
    {
      getTab: async () => null,
      closeSubtree: async () => {},
      nodeIdFromTabId: (tabId) => `tab:${tabId}`,
      resolveStaleWindowIdByNodeId: (nodeId) => (nodeId === "tab:42" ? 7 : null),
      removeTabIdsFromWindowTree: (windowId, tabIds) => {
        staleCalls.push(["remove", windowId, tabIds]);
      },
      pruneWindowTreeAgainstLiveTabs: async (windowId) => {
        staleCalls.push(["prune", windowId]);
      }
    }
  );
  assert.deepEqual(staleCalls, [
    ["remove", 7, [42]],
    ["prune", 7]
  ]);
});

test("handleReparentTabAction updates tree, browser position, grouping, and ordering", async () => {
  const calls = [];
  const tree = {
    nodes: {
      "tab:1": { tabId: 1, pinned: false },
      "tab:2": { tabId: 2, pinned: false }
    }
  };
  const nextTree = { windowId: 5, nodes: tree.nodes };

  await handleReparentTabAction(
    {
      payload: { tabId: 1, newParentTabId: 2, newIndex: 0, browserIndex: 4 },
      tab: { windowId: 5 },
      tree,
      nodeId: "tab:1"
    },
    {
      nodeIdFromTabId: (tabId) => `tab:${tabId}`,
      canReparent: () => true,
      moveNode: () => nextTree,
      sortTreeByIndex: (value) => value,
      resolveBrowserMoveIndex: async () => 3,
      moveTab: async (tabId, index) => {
        calls.push(["moveTab", tabId, index]);
      },
      logUnexpectedFailure: () => {
        calls.push(["log"]);
      },
      setWindowTree: (value) => {
        calls.push(["setWindowTree", value]);
      },
      getTab: async (tabId) => (tabId === 2 ? { groupId: 15 } : null),
      groupTabs: async (groupId, tabIds) => {
        calls.push(["groupTabs", groupId, tabIds]);
      },
      syncWindowOrdering: async (windowId) => {
        calls.push(["sync", windowId]);
      }
    }
  );

  assert.deepEqual(calls, [
    ["moveTab", 1, 3],
    ["setWindowTree", nextTree],
    ["groupTabs", 15, [1]],
    ["sync", 5]
  ]);
});

test("handleReparentTabAction skips tree update when browser move fails", async () => {
  const calls = [];
  const tree = {
    nodes: {
      "tab:1": { tabId: 1, pinned: false },
      "tab:2": { tabId: 2, pinned: false }
    }
  };

  await handleReparentTabAction(
    {
      payload: { tabId: 1, newParentTabId: 2, browserIndex: 4 },
      tab: { windowId: 9 },
      tree,
      nodeId: "tab:1"
    },
    {
      nodeIdFromTabId: (tabId) => `tab:${tabId}`,
      canReparent: () => true,
      moveNode: () => ({ windowId: 9, nodes: tree.nodes }),
      sortTreeByIndex: (value) => value,
      resolveBrowserMoveIndex: async () => 2,
      moveTab: async () => {
        throw new Error("move failed");
      },
      logUnexpectedFailure: () => {
        calls.push("log");
      },
      setWindowTree: () => {
        calls.push("setWindowTree");
      },
      getTab: async () => ({ groupId: 10 }),
      groupTabs: async () => {
        calls.push("groupTabs");
      },
      syncWindowOrdering: async () => {
        calls.push("sync");
      }
    }
  );

  assert.deepEqual(calls, ["log", "sync"]);
});

test("handleMoveToRootAction moves in browser then persists sorted tree", async () => {
  const calls = [];
  const tree = { nodes: { "tab:1": { tabId: 1, pinned: false } } };
  const nextTree = { windowId: 6, nodes: tree.nodes };

  await handleMoveToRootAction(
    {
      payload: { tabId: 1, index: 0, browserIndex: 7 },
      tab: { windowId: 6 },
      tree,
      nodeId: "tab:1"
    },
    {
      moveNode: () => nextTree,
      sortTreeByIndex: (value) => value,
      resolveBrowserMoveIndex: async () => 7,
      moveTab: async (tabId, index) => {
        calls.push(["moveTab", tabId, index]);
      },
      logUnexpectedFailure: () => {
        calls.push(["log"]);
      },
      setWindowTree: (value) => {
        calls.push(["setWindowTree", value]);
      },
      syncWindowOrdering: async (windowId) => {
        calls.push(["sync", windowId]);
      }
    }
  );

  assert.deepEqual(calls, [
    ["moveTab", 1, 7],
    ["setWindowTree", nextTree],
    ["sync", 6]
  ]);
});

