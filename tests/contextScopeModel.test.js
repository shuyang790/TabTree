import test from "node:test";
import assert from "node:assert/strict";
import { resolveContextScopeTabIds } from "../sidepanel/contextScopeModel.js";

function sampleTree() {
  return {
    nodes: {
      "tab:1": { tabId: 1 },
      "tab:2": { tabId: 2 },
      "tab:3": { tabId: 3 }
    }
  };
}

test("returns selected scoped ids when primary is selected", () => {
  const scoped = resolveContextScopeTabIds({
    tree: sampleTree(),
    primaryTabId: 2,
    selectedTabIds: new Set([1, 2, 99]),
    nodeIdFromTabId: (tabId) => `tab:${tabId}`
  });
  assert.deepEqual(scoped, [1, 2]);
});

test("returns only primary id when primary not in selected set", () => {
  const scoped = resolveContextScopeTabIds({
    tree: sampleTree(),
    primaryTabId: 3,
    selectedTabIds: new Set([1, 2]),
    nodeIdFromTabId: (tabId) => `tab:${tabId}`
  });
  assert.deepEqual(scoped, [3]);
});

test("returns empty when primary tab is missing from tree", () => {
  const scoped = resolveContextScopeTabIds({
    tree: sampleTree(),
    primaryTabId: 42,
    selectedTabIds: new Set([1, 2]),
    nodeIdFromTabId: (tabId) => `tab:${tabId}`
  });
  assert.deepEqual(scoped, []);
});
