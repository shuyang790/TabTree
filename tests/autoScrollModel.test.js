import test from "node:test";
import assert from "node:assert/strict";
import {
  blendAutoScrollVelocity,
  computeAutoScrollTargetDelta
} from "../sidepanel/autoScrollModel.js";

test("computeAutoScrollTargetDelta ramps up as pointer nears edge", () => {
  const rectTop = 100;
  const rectBottom = 500;
  const edgePx = 80;

  const nearEdge = computeAutoScrollTargetDelta({
    clientY: 102,
    rectTop,
    rectBottom,
    edgePx,
    minStep: 1,
    maxStep: 24
  });
  const midEdge = computeAutoScrollTargetDelta({
    clientY: 140,
    rectTop,
    rectBottom,
    edgePx,
    minStep: 1,
    maxStep: 24
  });
  const center = computeAutoScrollTargetDelta({
    clientY: 300,
    rectTop,
    rectBottom,
    edgePx,
    minStep: 1,
    maxStep: 24
  });

  assert.ok(Math.abs(nearEdge) > Math.abs(midEdge));
  assert.ok(midEdge < 0);
  assert.equal(center, 0);
});

test("computeAutoScrollTargetDelta scales with larger max step for virtualized lists", () => {
  const base = computeAutoScrollTargetDelta({
    clientY: 495,
    rectTop: 100,
    rectBottom: 500,
    edgePx: 80,
    minStep: 1,
    maxStep: 18
  });
  const virtualized = computeAutoScrollTargetDelta({
    clientY: 495,
    rectTop: 100,
    rectBottom: 500,
    edgePx: 80,
    minStep: 1,
    maxStep: 30
  });

  assert.ok(virtualized > base);
});

test("blendAutoScrollVelocity decelerates smoothly and snaps to zero", () => {
  let velocity = 14;
  velocity = blendAutoScrollVelocity(velocity, 0, { decel: 0.5, snapEpsilon: 0.45 });
  assert.ok(velocity > 0 && velocity < 14);

  for (let i = 0; i < 8; i += 1) {
    velocity = blendAutoScrollVelocity(velocity, 0, { decel: 0.5, snapEpsilon: 0.45 });
  }
  assert.equal(velocity, 0);
});
