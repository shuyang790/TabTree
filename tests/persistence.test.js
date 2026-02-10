import test from "node:test";
import assert from "node:assert/strict";

import { createPersistCoordinator } from "../background/persistence.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeoutMs = 600, intervalMs = 10 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await sleep(intervalMs);
  }
  assert.fail("Timed out waiting for predicate");
}

test("persist coordinator flushes dirty windows and coalesces snapshot writes", async () => {
  const windowsState = {
    1: { windowId: 1, nodes: {}, rootNodeIds: [] },
    2: { windowId: 2, nodes: {}, rootNodeIds: [] }
  };
  const windowWrites = [];
  let snapshotWrites = 0;

  const coordinator = createPersistCoordinator({
    saveWindowTree: async (tree) => {
      windowWrites.push(tree.windowId);
    },
    saveSyncSnapshot: async () => {
      snapshotWrites += 1;
    },
    getWindowsState: () => windowsState,
    flushDebounceMs: 15,
    snapshotMinIntervalMs: 0
  });

  coordinator.markWindowDirty(1);
  coordinator.markWindowDirty(2);

  await waitFor(() => windowWrites.length === 2 && snapshotWrites === 1);
  assert.deepEqual([...windowWrites].sort((a, b) => a - b), [1, 2]);

  coordinator.markWindowDirty(1);
  await waitFor(() => windowWrites.length === 3 && snapshotWrites === 2);
  assert.equal(windowWrites.filter((id) => id === 1).length, 2);

  coordinator.dispose();
});

test("persist coordinator retries when flush fails", async () => {
  const windowsState = {
    1: { windowId: 1, nodes: {}, rootNodeIds: [] }
  };
  let windowWriteCalls = 0;
  let snapshotWrites = 0;
  let errorCount = 0;
  let failFirst = true;

  const coordinator = createPersistCoordinator({
    saveWindowTree: async () => {
      windowWriteCalls += 1;
      if (failFirst) {
        failFirst = false;
        throw new Error("simulated write failure");
      }
    },
    saveSyncSnapshot: async () => {
      snapshotWrites += 1;
    },
    getWindowsState: () => windowsState,
    onError: () => {
      errorCount += 1;
    },
    flushDebounceMs: 10,
    snapshotMinIntervalMs: 0,
    retryBaseMs: 10,
    retryMaxMs: 40
  });

  coordinator.markWindowDirty(1);

  await waitFor(() => windowWriteCalls >= 2 && snapshotWrites >= 1 && errorCount >= 1, { timeoutMs: 1200 });
  assert.ok(windowWriteCalls >= 2);
  assert.ok(snapshotWrites >= 1);
  assert.ok(errorCount >= 1);

  coordinator.dispose();
});
