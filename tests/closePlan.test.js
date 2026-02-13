import test from "node:test";
import assert from "node:assert/strict";
import { buildClosePlan, shouldConfirmClose } from "../sidepanel/closePlan.js";

function sampleTree() {
  return {
    nodes: {
      "tab:1": { parentNodeId: null, childNodeIds: ["tab:2"], tabId: 1 },
      "tab:2": { parentNodeId: "tab:1", childNodeIds: ["tab:4"], tabId: 2 },
      "tab:3": { parentNodeId: null, childNodeIds: [], tabId: 3 },
      "tab:4": { parentNodeId: "tab:2", childNodeIds: [], tabId: 4 }
    }
  };
}

test("buildClosePlan dedupes descendants under selected ancestors", () => {
  const tree = sampleTree();
  const plan = buildClosePlan(tree, [1, 2, 4], (tabId) => `tab:${tabId}`);
  assert.deepEqual(plan.rootTabIds, [1]);
  assert.equal(plan.totalTabs, 3);
});

test("shouldConfirmClose respects settings and minimum tab count", () => {
  const settings = {
    confirmCloseBatch: true,
    confirmCloseSubtree: false
  };
  assert.equal(shouldConfirmClose(settings, 1, true), false);
  assert.equal(shouldConfirmClose(settings, 2, true), true);
  assert.equal(shouldConfirmClose(settings, 2, false), false);
});
