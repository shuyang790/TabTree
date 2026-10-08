import test from "node:test";
import assert from "node:assert/strict";
import {
  insertionIndexForGroupMove,
  relativeMoveDestinationIndex,
  uniqueFiniteTabIdsInOrder
} from "../background/treeActionHelpers.js";

test("uniqueFiniteTabIdsInOrder filters non-finite ids and preserves first-seen order", () => {
  const result = uniqueFiniteTabIdsInOrder([3, 2, 3, NaN, 5, Infinity, 2, 4]);
  assert.deepEqual(result, [3, 2, 5, 4]);
});

test("insertionIndexForGroupMove resolves target tab/group indices", () => {
  const tabs = [
    { id: 1, index: 0, groupId: 8 },
    { id: 2, index: 1, groupId: 8 },
    { id: 3, index: 2, groupId: 9 },
    { id: 4, index: 3, groupId: 9 },
    { id: 5, index: 4, groupId: -1 }
  ];

  assert.equal(
    insertionIndexForGroupMove(tabs, [1, 2], {
      targetTabId: 4,
      position: "before"
    }),
    3
  );

  assert.equal(
    insertionIndexForGroupMove(tabs, [1, 2], {
      targetGroupId: 9,
      position: "after"
    }),
    4
  );
});

test("relativeMoveDestinationIndex handles before/after with index-shift correction", () => {
  assert.equal(relativeMoveDestinationIndex(10, 3, "after"), 10);
  assert.equal(relativeMoveDestinationIndex(10, 12, "after"), 11);
  assert.equal(relativeMoveDestinationIndex(10, 3, "before"), 9);
  assert.equal(relativeMoveDestinationIndex(10, 12, "before"), 10);
  assert.equal(relativeMoveDestinationIndex(10, 3, "invalid"), -1);
});
