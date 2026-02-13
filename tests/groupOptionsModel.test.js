import test from "node:test";
import assert from "node:assert/strict";
import { orderedExistingGroups } from "../sidepanel/groupOptionsModel.js";

function sampleTree() {
  return {
    groups: {
      10: { id: 10, title: "Alpha", color: "blue" },
      20: { id: 20, title: "", color: "green" },
      30: { id: 30, title: "Gamma", color: "red" }
    },
    nodes: {
      "tab:1": { tabId: 1, groupId: 10 },
      "tab:2": { tabId: 2, groupId: 10 },
      "tab:3": { tabId: 3, groupId: 30 }
    }
  };
}

test("orderedExistingGroups prioritizes groups by block order and dedupes", () => {
  const tree = sampleTree();
  const groups = orderedExistingGroups(
    tree,
    [
      { type: "node", rootNodeId: "tab:5" },
      { type: "group", groupId: 30, rootNodeIds: ["tab:3"] },
      { type: "group", groupId: 10, rootNodeIds: ["tab:1", "tab:2"] },
      { type: "group", groupId: 30, rootNodeIds: ["tab:3"] }
    ],
    { unnamedGroupLabel: "Unnamed group" }
  );

  assert.deepEqual(groups, [
    { id: 30, title: "Gamma", color: "red", tabCount: 1 },
    { id: 10, title: "Alpha", color: "blue", tabCount: 2 },
    { id: 20, title: "Unnamed group", color: "green", tabCount: 0 }
  ]);
});

test("orderedExistingGroups skips invalid group metadata", () => {
  const tree = {
    groups: {
      foo: { id: "foo", title: "Bad", color: "grey" },
      11: { id: 11, title: "Valid", color: "blue" }
    },
    nodes: {
      "tab:1": { tabId: 1, groupId: 11 }
    }
  };

  const groups = orderedExistingGroups(tree, [], { unnamedGroupLabel: "Unnamed group" });
  assert.deepEqual(groups, [{ id: 11, title: "Valid", color: "blue", tabCount: 1 }]);
});

