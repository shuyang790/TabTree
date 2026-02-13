import test from "node:test";
import assert from "node:assert/strict";
import { buildVisibilityMap, matchesSearch, shouldRenderNode } from "../sidepanel/searchModel.js";

function treeFixture() {
  return {
    rootNodeIds: ["tab:1", "tab:3"],
    nodes: {
      "tab:1": {
        tabId: 1,
        lastKnownTitle: "Parent Alpha",
        lastKnownUrl: "https://example.com/alpha",
        childNodeIds: ["tab:2"]
      },
      "tab:2": {
        tabId: 2,
        lastKnownTitle: "Child Beta",
        lastKnownUrl: "https://example.com/beta",
        childNodeIds: []
      },
      "tab:3": {
        tabId: 3,
        lastKnownTitle: "Gamma Root",
        lastKnownUrl: "https://example.com/gamma",
        childNodeIds: []
      }
    }
  };
}

test("matchesSearch checks title and url case-insensitively", () => {
  const node = {
    lastKnownTitle: "My Tab",
    lastKnownUrl: "https://example.com/path"
  };
  assert.equal(matchesSearch(node, "my"), true);
  assert.equal(matchesSearch(node, "example.com"), true);
  assert.equal(matchesSearch(node, "missing"), false);
});

test("buildVisibilityMap bubbles visibility from matching descendants", () => {
  const tree = treeFixture();
  const visibility = buildVisibilityMap(tree, "beta");
  assert.equal(visibility.get("tab:2"), true);
  assert.equal(visibility.get("tab:1"), true);
  assert.equal(visibility.get("tab:3"), false);
});

test("shouldRenderNode renders existing nodes for empty query and map hits for filtered query", () => {
  const tree = treeFixture();
  const visibility = buildVisibilityMap(tree, "gamma");

  assert.equal(shouldRenderNode(tree, "tab:1", "", visibility), true);
  assert.equal(shouldRenderNode(tree, "tab:2", "gamma", visibility), false);
  assert.equal(shouldRenderNode(tree, "tab:3", "gamma", visibility), true);
});
