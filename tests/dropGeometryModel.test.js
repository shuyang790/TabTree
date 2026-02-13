import test from "node:test";
import assert from "node:assert/strict";
import {
  fallbackEdgePositionFromCoordinates,
  getDropPositionFromCoordinates
} from "../sidepanel/dropGeometryModel.js";

test("getDropPositionFromCoordinates returns before near top edge", () => {
  const position = getDropPositionFromCoordinates({
    clientY: 109,
    rectTop: 100,
    rectHeight: 50
  });
  assert.equal(position, "before");
});

test("getDropPositionFromCoordinates returns after near bottom edge", () => {
  const position = getDropPositionFromCoordinates({
    clientY: 146,
    rectTop: 100,
    rectHeight: 50
  });
  assert.equal(position, "after");
});

test("getDropPositionFromCoordinates returns inside in center when allowed", () => {
  const position = getDropPositionFromCoordinates({
    clientY: 125,
    rectTop: 100,
    rectHeight: 50,
    allowInside: true
  });
  assert.equal(position, "inside");
});

test("getDropPositionFromCoordinates falls back to nearest edge when inside is disabled", () => {
  const before = getDropPositionFromCoordinates({
    clientY: 121,
    rectTop: 100,
    rectHeight: 50,
    allowInside: false
  });
  const after = getDropPositionFromCoordinates({
    clientY: 129,
    rectTop: 100,
    rectHeight: 50,
    allowInside: false
  });
  assert.equal(before, "before");
  assert.equal(after, "after");
});

test("getDropPositionFromCoordinates honors custom edge ratio", () => {
  const position = getDropPositionFromCoordinates({
    clientY: 111,
    rectTop: 100,
    rectHeight: 50,
    edgeRatio: 0.25
  });
  assert.equal(position, "before");
});

test("fallbackEdgePositionFromCoordinates splits at the midpoint", () => {
  const before = fallbackEdgePositionFromCoordinates({
    clientY: 124,
    rectTop: 100,
    rectHeight: 50
  });
  const after = fallbackEdgePositionFromCoordinates({
    clientY: 126,
    rectTop: 100,
    rectHeight: 50
  });
  assert.equal(before, "before");
  assert.equal(after, "after");
});

