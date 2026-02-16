import test from "node:test";
import assert from "node:assert/strict";

import { isTreeActionType, TREE_ACTIONS } from "../shared/constants.js";

test("isTreeActionType accepts every defined tree action", () => {
  for (const action of Object.values(TREE_ACTIONS)) {
    assert.equal(isTreeActionType(action), true);
  }
});

test("isTreeActionType rejects unknown or invalid values", () => {
  assert.equal(isTreeActionType("UNKNOWN_ACTION"), false);
  assert.equal(isTreeActionType(""), false);
  assert.equal(isTreeActionType(null), false);
  assert.equal(isTreeActionType(undefined), false);
  assert.equal(isTreeActionType(42), false);
});
