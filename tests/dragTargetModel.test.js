import test from "node:test";
import assert from "node:assert/strict";
import {
  dropClassesForTarget,
  emptyDragTarget,
  normalizeDragTarget,
  sameDragTarget
} from "../sidepanel/dragTargetModel.js";

test("normalizeDragTarget sanitizes incoming payload", () => {
  const normalized = normalizeDragTarget({
    kind: "tab",
    tabId: 12,
    groupId: 4.2,
    position: "after",
    valid: 1
  });
  assert.deepEqual(normalized, {
    kind: "tab",
    tabId: 12,
    groupId: null,
    position: "after",
    valid: true
  });
});

test("sameDragTarget compares all structural fields", () => {
  const a = { kind: "tab", tabId: 1, groupId: null, position: "before", valid: true };
  const b = { kind: "tab", tabId: 1, groupId: null, position: "before", valid: true };
  const c = { kind: "tab", tabId: 2, groupId: null, position: "before", valid: true };
  assert.equal(sameDragTarget(a, b), true);
  assert.equal(sameDragTarget(a, c), false);
});

test("dropClassesForTarget returns expected style class names", () => {
  assert.deepEqual(dropClassesForTarget(emptyDragTarget()), []);
  assert.deepEqual(dropClassesForTarget({ kind: "tab", valid: false }), ["drop-invalid"]);
  assert.deepEqual(
    dropClassesForTarget({ kind: "tab", valid: true, position: "before" }),
    ["drop-valid-before"]
  );
  assert.deepEqual(
    dropClassesForTarget({ kind: "tab", valid: true, position: "after" }),
    ["drop-valid-after"]
  );
  assert.deepEqual(
    dropClassesForTarget({ kind: "tab", valid: true, position: "inside" }),
    ["drop-valid-inside"]
  );
});
