import test from "node:test";
import assert from "node:assert/strict";

import { createWindowOrderSyncCoordinator } from "../background/orderSyncCoordinator.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeoutMs = 800, intervalMs = 10 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await sleep(intervalMs);
  }
  assert.fail("Timed out waiting for predicate");
}

test("order sync coordinator coalesces repeated schedules", async () => {
  let runCount = 0;
  const coordinator = createWindowOrderSyncCoordinator({
    delayMs: 20,
    runSync: async () => {
      runCount += 1;
    }
  });

  coordinator.schedule(7);
  coordinator.schedule(7);
  coordinator.schedule(7);

  await waitFor(() => runCount === 1);
  coordinator.dispose();
});

test("order sync coordinator requests exactly one rerun while in flight", async () => {
  let runCount = 0;
  let releaseFirstRun = null;
  const firstRunGate = new Promise((resolve) => {
    releaseFirstRun = resolve;
  });

  const coordinator = createWindowOrderSyncCoordinator({
    delayMs: 20,
    runSync: async () => {
      runCount += 1;
      if (runCount === 1) {
        await firstRunGate;
      }
    }
  });

  const firstRun = coordinator.runNow(9);
  await waitFor(() => runCount === 1);

  void coordinator.runNow(9);
  void coordinator.runNow(9);
  coordinator.schedule(9, 0);

  releaseFirstRun();
  await firstRun;
  await waitFor(() => runCount === 2);
  await sleep(40);
  assert.equal(runCount, 2);
  coordinator.dispose();
});

test("order sync coordinator runNow clears pending timer", async () => {
  let runCount = 0;
  const coordinator = createWindowOrderSyncCoordinator({
    delayMs: 120,
    runSync: async () => {
      runCount += 1;
    }
  });

  coordinator.schedule(3, 120);
  await coordinator.runNow(3);
  assert.equal(runCount, 1);

  await sleep(170);
  assert.equal(runCount, 1);
  coordinator.dispose();
});

test("order sync coordinator reports errors and keeps running", async () => {
  let runCount = 0;
  let errorCount = 0;
  const coordinator = createWindowOrderSyncCoordinator({
    delayMs: 10,
    runSync: async () => {
      runCount += 1;
      if (runCount === 1) {
        throw new Error("first run fails");
      }
    },
    onError: () => {
      errorCount += 1;
    }
  });

  await coordinator.runNow(12);
  await coordinator.runNow(12);
  assert.equal(runCount, 2);
  assert.equal(errorCount, 1);
  coordinator.dispose();
});
