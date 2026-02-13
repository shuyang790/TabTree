import test from "node:test";
import assert from "node:assert/strict";
import {
  pruneSelection,
  replaceSelection,
  selectRangeTo,
  selectedExistingTabIds,
  selectedTabIdsArray,
  toggleSelection
} from "../sidepanel/selectionModel.js";

test("replaceSelection keeps finite ids and normalizes anchor", () => {
  const next = replaceSelection([1, 2, NaN, Infinity, 3], 2);
  assert.deepEqual(selectedTabIdsArray(next.selectedTabIds), [1, 2, 3]);
  assert.equal(next.selectionAnchorTabId, 2);
});

test("toggleSelection toggles membership and assigns anchor when missing", () => {
  let state = replaceSelection([], null);
  state = toggleSelection(state, 10);
  assert.deepEqual(selectedTabIdsArray(state.selectedTabIds), [10]);
  assert.equal(state.selectionAnchorTabId, 10);

  state = toggleSelection(state, 10);
  assert.deepEqual(selectedTabIdsArray(state.selectedTabIds), []);
  assert.equal(state.selectionAnchorTabId, null);
});

test("selectRangeTo selects from anchor to target in visible order", () => {
  const base = replaceSelection([3], 3);
  const next = selectRangeTo([1, 2, 3, 4, 5], base, 5);
  assert.deepEqual(selectedTabIdsArray(next.selectedTabIds), [3, 4, 5]);
  assert.equal(next.selectionAnchorTabId, 3);
});

test("selectedExistingTabIds filters out missing nodes", () => {
  const tree = {
    nodes: {
      "tab:1": { tabId: 1 },
      "tab:3": { tabId: 3 }
    }
  };
  const result = selectedExistingTabIds(tree, new Set([1, 2, 3]), (tabId) => `tab:${tabId}`);
  assert.deepEqual(result, [1, 3]);
});

test("pruneSelection drops stale ids and clears stale anchor", () => {
  const tree = {
    nodes: {
      "tab:2": { tabId: 2 },
      "tab:4": { tabId: 4 }
    }
  };
  const next = pruneSelection(tree, {
    selectedTabIds: new Set([1, 2, 4]),
    selectionAnchorTabId: 1
  });
  assert.deepEqual(selectedTabIdsArray(next.selectedTabIds), [2, 4]);
  assert.equal(next.selectionAnchorTabId, null);
});
