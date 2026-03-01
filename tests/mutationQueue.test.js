import test from "node:test";
import assert from "node:assert/strict";

import { createWindowMutationQueue } from "../background/mutationQueue.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("createWindowMutationQueue serializes operations per window", async () => {
  const queue = createWindowMutationQueue();
  const events = [];

  const first = queue.run(3, async () => {
    events.push("first:start");
    await sleep(20);
    events.push("first:end");
  });

  const second = queue.run(3, async () => {
    events.push("second:start");
    events.push("second:end");
  });

  await Promise.all([first, second]);
  assert.deepEqual(events, [
    "first:start",
    "first:end",
    "second:start",
    "second:end"
  ]);
});

test("createWindowMutationQueue allows different windows to proceed independently", async () => {
  const queue = createWindowMutationQueue();
  const events = [];
  let releaseFirstWindow = null;

  const firstWindowGate = new Promise((resolve) => {
    releaseFirstWindow = resolve;
  });

  const first = queue.run(10, async () => {
    events.push("w10:start");
    await firstWindowGate;
    events.push("w10:end");
  });

  await sleep(5);

  const second = queue.run(11, async () => {
    events.push("w11:start");
    events.push("w11:end");
  });

  await sleep(20);
  assert.ok(events.includes("w11:end"));
  releaseFirstWindow();
  await Promise.all([first, second]);
});

test("createWindowMutationQueue keeps queue alive after failures", async () => {
  let errorCount = 0;
  const queue = createWindowMutationQueue({
    onError: () => {
      errorCount += 1;
    }
  });
  const events = [];

  await assert.rejects(
    queue.run(15, async () => {
      events.push("first:start");
      throw new Error("boom");
    }),
    /boom/
  );

  await queue.run(15, async () => {
    events.push("second:start");
    events.push("second:end");
  });

  assert.equal(errorCount, 1);
  assert.deepEqual(events, [
    "first:start",
    "second:start",
    "second:end"
  ]);
});
