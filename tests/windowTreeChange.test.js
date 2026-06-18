import test from "node:test";
import assert from "node:assert/strict";

import { classifyWindowTreeChange } from "../background/windowTreeChange.js";

function tree(overrides = {}) {
  return {
    windowId: 1,
    version: 1,
    rootNodeIds: ["tab:1"],
    selectedTabId: 1,
    groups: {},
    nodes: {
      "tab:1": {
        nodeId: "tab:1",
        tabId: 1,
        parentNodeId: null,
        childNodeIds: [],
        collapsed: false,
        pinned: false,
        groupId: null,
        index: 0,
        windowId: 1,
        active: true,
        lastKnownTitle: "One",
        lastKnownUrl: "https://example.com/one",
        favIconUrl: "",
        createdAt: 100,
        updatedAt: 100
      }
    },
    updatedAt: 100,
    lastSeenAt: 100,
    archivedAt: null,
    persistenceVersion: 1,
    restoreArchiveId: "restore-1",
    ...overrides
  };
}

test("classifyWindowTreeChange ignores volatile timestamps", () => {
  assert.equal(classifyWindowTreeChange(tree(), tree({
    updatedAt: 200,
    lastSeenAt: 200,
    persistenceVersion: 1
  })), "none");
});

test("classifyWindowTreeChange treats restore metadata as non-rendering", () => {
  assert.equal(classifyWindowTreeChange(tree(), tree({
    restoreStartupPending: false,
    restoreSource: "previous",
    restoreScore: 4
  })), "metadata");
});

test("classifyWindowTreeChange detects renderable node changes", () => {
  const next = tree({
    nodes: {
      "tab:1": {
        ...tree().nodes["tab:1"],
        lastKnownTitle: "Renamed"
      }
    }
  });

  assert.equal(classifyWindowTreeChange(tree(), next), "render");
});

test("classifyWindowTreeChange detects root order changes", () => {
  const previous = tree({
    rootNodeIds: ["tab:1", "tab:2"],
    nodes: {
      ...tree().nodes,
      "tab:2": {
        ...tree().nodes["tab:1"],
        nodeId: "tab:2",
        tabId: 2,
        index: 1,
        active: false,
        lastKnownTitle: "Two"
      }
    }
  });
  const next = {
    ...previous,
    rootNodeIds: ["tab:2", "tab:1"]
  };

  assert.equal(classifyWindowTreeChange(previous, next), "render");
});
