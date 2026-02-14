import test from "node:test";
import assert from "node:assert/strict";
import { TREE_ACTIONS } from "../shared/constants.js";
import {
  buildMoveGroupBlockPayload,
  canDropGroup,
  GROUP_DROP_BLOCK_REASONS,
  groupDropBlockReason
} from "../sidepanel/groupDropModel.js";

function sampleTree() {
  return {
    nodes: {
      "tab:1": { tabId: 1, groupId: 10, pinned: false, parentNodeId: null },
      "tab:2": { tabId: 2, groupId: 10, pinned: false, parentNodeId: null },
      "tab:3": { tabId: 3, groupId: 20, pinned: false, parentNodeId: null },
      "tab:4": { tabId: 4, groupId: 20, pinned: false, parentNodeId: "tab:3" },
      "tab:5": { tabId: 5, groupId: 30, pinned: true, parentNodeId: null }
    }
  };
}

test("canDropGroup rejects missing source rows and same-group targets", () => {
  const tree = sampleTree();

  assert.equal(
    canDropGroup({ tree, sourceGroupId: 30, targetGroupId: 20 }),
    false
  );

  assert.equal(
    canDropGroup({ tree, sourceGroupId: 10, targetGroupId: 10 }),
    false
  );
});

test("canDropGroup validates target tab constraints", () => {
  const tree = sampleTree();

  assert.equal(
    canDropGroup({ tree, sourceGroupId: 10, targetTabId: 4 }),
    false
  );

  assert.equal(
    canDropGroup({ tree, sourceGroupId: 10, targetTabId: 5 }),
    false
  );

  assert.equal(
    canDropGroup({ tree, sourceGroupId: 10, targetTabId: 1 }),
    false
  );

  assert.equal(
    canDropGroup({ tree, sourceGroupId: 10, targetTabId: 3 }),
    true
  );
});

test("groupDropBlockReason returns specific reason codes", () => {
  const tree = sampleTree();

  assert.equal(
    groupDropBlockReason({ tree, sourceGroupId: 10, targetGroupId: 10 }),
    GROUP_DROP_BLOCK_REASONS.SAME_GROUP
  );

  assert.equal(
    groupDropBlockReason({ tree, sourceGroupId: 10, targetTabId: 5 }),
    GROUP_DROP_BLOCK_REASONS.PINNED_TARGET
  );

  assert.equal(
    groupDropBlockReason({ tree, sourceGroupId: 10, targetTabId: 4 }),
    GROUP_DROP_BLOCK_REASONS.NON_ROOT_TARGET
  );
});

test("buildMoveGroupBlockPayload builds target-specific payloads", () => {
  const base = {
    sourceGroupId: 10,
    windowId: 42,
    position: "before"
  };

  assert.deepEqual(
    buildMoveGroupBlockPayload({ ...base, target: { kind: "group", groupId: 20 } }),
    {
      type: TREE_ACTIONS.MOVE_GROUP_BLOCK,
      sourceGroupId: 10,
      windowId: 42,
      position: "before",
      targetGroupId: 20
    }
  );

  assert.deepEqual(
    buildMoveGroupBlockPayload({ ...base, target: { kind: "tab", tabId: 3 } }),
    {
      type: TREE_ACTIONS.MOVE_GROUP_BLOCK,
      sourceGroupId: 10,
      windowId: 42,
      position: "before",
      targetTabId: 3
    }
  );
});

test("buildMoveGroupBlockPayload rejects invalid inputs", () => {
  assert.equal(
    buildMoveGroupBlockPayload({
      sourceGroupId: null,
      windowId: 42,
      target: { kind: "group", groupId: 20 },
      position: "before"
    }),
    null
  );

  assert.equal(
    buildMoveGroupBlockPayload({
      sourceGroupId: 10,
      windowId: 42,
      target: { kind: "group", groupId: 20 },
      position: "inside"
    }),
    null
  );
});
