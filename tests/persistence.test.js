import test from "node:test";
import assert from "node:assert/strict";

import { createPersistCoordinator } from "../background/persistence.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("startup waits for recovery and migration before atomically saving dirty windows", async (t) => {
  let ready = false;
  const batches = [];
  const windows = { 1: { windowId: 1 }, 2: { windowId: 2 } };
  const coordinator = createPersistCoordinator({
    saveWindowTree: async () => assert.fail("production must batch window writes"),
    saveWindowTrees: async (state, ids) => batches.push({ state, ids }),
    saveSyncSnapshot: async () => {},
    getWindowsState: () => windows,
    isReady: () => ready,
    flushDebounceMs: 10000,
    snapshotMinIntervalMs: 0,
    heavySnapshotMinIntervalMs: 0
  });
  t.after(() => coordinator.dispose());
  coordinator.markWindowDirty(1);
  coordinator.markWindowDirty(2);
  await coordinator.flushNow();
  assert.deepEqual(batches, []);
  ready = true;
  await coordinator.flushNow();
  assert.deepEqual(batches, [{ state: windows, ids: [1, 2] }]);
});

test("capacity failure keeps the whole batch dirty until a successful local retry", async (t) => {
  let fail = true;
  let successes = 0;
  const attempts = [];
  const phases = [];
  const coordinator = createPersistCoordinator({
    saveWindowTrees: async (_state, ids) => {
      attempts.push(ids);
      if (fail) throw Object.assign(new Error("full"), { code: "LOCAL_STORAGE_CAPACITY" });
    },
    saveSyncSnapshot: async () => {},
    getWindowsState: () => ({ 1: { windowId: 1 }, 2: { windowId: 2 } }),
    onError: (_error, { phase }) => phases.push(phase),
    onLocalSuccess: () => successes++,
    flushDebounceMs: 10000,
    retryBaseMs: 10000,
    retryMaxMs: 10000,
    snapshotMinIntervalMs: 0,
    heavySnapshotMinIntervalMs: 0
  });
  t.after(() => coordinator.dispose());
  coordinator.markWindowDirty(1);
  coordinator.markWindowDirty(2);
  await coordinator.flushNow();
  assert.equal(successes, 0);
  assert.deepEqual(phases, ["window"]);
  fail = false;
  await coordinator.flushNow();
  assert.deepEqual(attempts, [[1, 2], [1, 2]]);
  assert.equal(successes, 1);
});

test("sync quota failures are distinguished from local persistence failures", async (t) => {
  let successes = 0;
  const phases = [];
  const coordinator = createPersistCoordinator({
    saveWindowTree: async () => {},
    saveSyncSnapshot: async () => { throw new Error("sync quota"); },
    getWindowsState: () => ({ 1: { windowId: 1 } }),
    onError: (_error, { phase }) => phases.push(phase),
    onLocalSuccess: () => successes++,
    flushDebounceMs: 10000,
    retryBaseMs: 10000,
    retryMaxMs: 10000,
    snapshotMinIntervalMs: 0,
    heavySnapshotMinIntervalMs: 0
  });
  t.after(() => coordinator.dispose());
  coordinator.markWindowDirty(1);
  await coordinator.flushNow();
  assert.equal(successes, 1);
  assert.deepEqual(phases, ["syncSnapshot"]);
});

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
  let localSnapshotWrites = 0;
  let restoreArchiveWrites = 0;

  const coordinator = createPersistCoordinator({
    saveWindowTree: async (tree) => {
      windowWrites.push(tree.windowId);
    },
    saveLocalSnapshot: async () => {
      localSnapshotWrites += 1;
    },
    saveSyncSnapshot: async () => {
      snapshotWrites += 1;
    },
    saveRestoreArchive: async () => {
      restoreArchiveWrites += 1;
    },
    getWindowsState: () => windowsState,
    flushDebounceMs: 15,
    snapshotMinIntervalMs: 0,
    heavySnapshotMinIntervalMs: 0
  });

  coordinator.markWindowDirty(1);
  coordinator.markWindowDirty(2);

  await waitFor(() => windowWrites.length === 2 && snapshotWrites === 1 && localSnapshotWrites >= 1 && restoreArchiveWrites >= 1);
  assert.deepEqual([...windowWrites].sort((a, b) => a - b), [1, 2]);

  coordinator.markWindowDirty(1);
  await waitFor(() => windowWrites.length === 3 && snapshotWrites === 2 && localSnapshotWrites >= 2 && restoreArchiveWrites >= 2);
  assert.equal(windowWrites.filter((id) => id === 1).length, 2);

  coordinator.dispose();
});

test("persist coordinator retries when flush fails", async () => {
  const windowsState = {
    1: { windowId: 1, nodes: {}, rootNodeIds: [] }
  };
  let windowWriteCalls = 0;
  let snapshotWrites = 0;
  let localSnapshotWrites = 0;
  let restoreArchiveWrites = 0;
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
    saveLocalSnapshot: async () => {
      localSnapshotWrites += 1;
    },
    saveRestoreArchive: async () => {
      restoreArchiveWrites += 1;
    },
    getWindowsState: () => windowsState,
    onError: () => {
      errorCount += 1;
    },
    flushDebounceMs: 10,
    snapshotMinIntervalMs: 0,
    heavySnapshotMinIntervalMs: 0,
    retryBaseMs: 10,
    retryMaxMs: 40
  });

  coordinator.markWindowDirty(1);

  await waitFor(() => windowWriteCalls >= 2 && snapshotWrites >= 1 && localSnapshotWrites >= 1 && restoreArchiveWrites >= 1 && errorCount >= 1, { timeoutMs: 1200 });
  assert.ok(windowWriteCalls >= 2);
  assert.ok(snapshotWrites >= 1);
  assert.ok(localSnapshotWrites >= 1);
  assert.ok(restoreArchiveWrites >= 1);
  assert.ok(errorCount >= 1);

  coordinator.dispose();
});

test("persist coordinator throttles snapshot writes but still flushes window trees", async () => {
  const windowsState = {
    1: { windowId: 1, nodes: {}, rootNodeIds: [] }
  };
  let windowWrites = 0;
  let snapshotWrites = 0;
  let localSnapshotWrites = 0;
  let restoreArchiveWrites = 0;

  const coordinator = createPersistCoordinator({
    saveWindowTree: async () => {
      windowWrites += 1;
    },
    saveSyncSnapshot: async () => {
      snapshotWrites += 1;
    },
    saveLocalSnapshot: async () => {
      localSnapshotWrites += 1;
    },
    saveRestoreArchive: async () => {
      restoreArchiveWrites += 1;
    },
    getWindowsState: () => windowsState,
    flushDebounceMs: 10,
    snapshotMinIntervalMs: 80,
    heavySnapshotMinIntervalMs: 0
  });

  coordinator.markWindowDirty(1);
  await waitFor(() => windowWrites >= 1 && snapshotWrites >= 1);

  coordinator.markWindowDirty(1);
  await waitFor(() => windowWrites >= 2, { timeoutMs: 600 });
  assert.equal(snapshotWrites, 1);

  await waitFor(() => snapshotWrites >= 2, { timeoutMs: 1200 });
  assert.ok(windowWrites >= 2);
  assert.ok(localSnapshotWrites >= 2);
  assert.ok(restoreArchiveWrites >= 2);

  coordinator.dispose();
});

test("persist coordinator flushNow bypasses debounce and clears pending timer", async () => {
  const windowsState = {
    1: { windowId: 1, nodes: {}, rootNodeIds: [] }
  };
  let windowWrites = 0;
  let snapshotWrites = 0;
  let localSnapshotWrites = 0;
  let restoreArchiveWrites = 0;

  const coordinator = createPersistCoordinator({
    saveWindowTree: async () => {
      windowWrites += 1;
    },
    saveSyncSnapshot: async () => {
      snapshotWrites += 1;
    },
    saveLocalSnapshot: async () => {
      localSnapshotWrites += 1;
    },
    saveRestoreArchive: async () => {
      restoreArchiveWrites += 1;
    },
    getWindowsState: () => windowsState,
    flushDebounceMs: 1000,
    snapshotMinIntervalMs: 0,
    heavySnapshotMinIntervalMs: 0
  });

  coordinator.markWindowDirty(1);
  await coordinator.flushNow();
  assert.equal(windowWrites, 1);
  assert.equal(snapshotWrites, 1);
  assert.equal(localSnapshotWrites, 1);
  assert.equal(restoreArchiveWrites, 1);

  await sleep(60);
  assert.equal(windowWrites, 1);
  assert.equal(snapshotWrites, 1);
  assert.equal(localSnapshotWrites, 1);
  assert.equal(restoreArchiveWrites, 1);

  coordinator.dispose();
});

test("persist coordinator writes local snapshot even when no windows are dirty", async () => {
  const windowsState = {
    1: { windowId: 1, nodes: {}, rootNodeIds: [] }
  };
  let windowWrites = 0;
  let syncSnapshotWrites = 0;
  let localSnapshotWrites = 0;
  let restoreArchiveWrites = 0;

  const coordinator = createPersistCoordinator({
    saveWindowTree: async () => {
      windowWrites += 1;
    },
    saveSyncSnapshot: async () => {
      syncSnapshotWrites += 1;
    },
    saveLocalSnapshot: async () => {
      localSnapshotWrites += 1;
    },
    saveRestoreArchive: async () => {
      restoreArchiveWrites += 1;
    },
    getWindowsState: () => windowsState,
    flushDebounceMs: 10,
    snapshotMinIntervalMs: 0,
    heavySnapshotMinIntervalMs: 0
  });

  coordinator.markSnapshotDirty();
  await waitFor(() => localSnapshotWrites >= 1 && syncSnapshotWrites >= 1 && restoreArchiveWrites >= 1);
  assert.equal(windowWrites, 0);

  coordinator.dispose();
});

test("persist coordinator throttles heavy snapshots separately from window tree writes", async () => {
  const windowsState = {
    1: { windowId: 1, nodes: {}, rootNodeIds: [] }
  };
  let windowWrites = 0;
  let syncSnapshotWrites = 0;
  let localSnapshotWrites = 0;
  let restoreArchiveWrites = 0;

  const coordinator = createPersistCoordinator({
    saveWindowTree: async () => {
      windowWrites += 1;
    },
    saveSyncSnapshot: async () => {
      syncSnapshotWrites += 1;
    },
    saveLocalSnapshot: async () => {
      localSnapshotWrites += 1;
    },
    saveRestoreArchive: async () => {
      restoreArchiveWrites += 1;
    },
    getWindowsState: () => windowsState,
    flushDebounceMs: 10,
    snapshotMinIntervalMs: 0,
    heavySnapshotMinIntervalMs: 80
  });

  coordinator.markWindowDirty(1);
  await waitFor(() => windowWrites === 1 && syncSnapshotWrites === 1 && localSnapshotWrites === 1 && restoreArchiveWrites === 1);

  coordinator.markWindowDirty(1);
  await waitFor(() => windowWrites === 2 && syncSnapshotWrites === 2, { timeoutMs: 600 });
  assert.equal(localSnapshotWrites, 1);
  assert.equal(restoreArchiveWrites, 1);

  await waitFor(() => localSnapshotWrites === 2 && restoreArchiveWrites === 2, { timeoutMs: 1200 });

  coordinator.dispose();
});

test("persist coordinator does not rewrite saved windows when snapshot backups fail", async () => {
  const windowsState = {
    1: { windowId: 1, nodes: {}, rootNodeIds: [] }
  };
  let windowWrites = 0;
  let localSnapshotWrites = 0;
  let syncSnapshotWrites = 0;
  let errorCount = 0;

  const coordinator = createPersistCoordinator({
    saveWindowTree: async () => {
      windowWrites += 1;
    },
    saveSyncSnapshot: async () => {
      syncSnapshotWrites += 1;
    },
    saveLocalSnapshot: async () => {
      localSnapshotWrites += 1;
      throw new Error("simulated backup quota failure");
    },
    saveRestoreArchive: async () => {
      throw new Error("should not write archive after local snapshot failure");
    },
    getWindowsState: () => windowsState,
    onError: () => {
      errorCount += 1;
    },
    flushDebounceMs: 10,
    snapshotMinIntervalMs: 0,
    heavySnapshotMinIntervalMs: 0,
    retryBaseMs: 10,
    retryMaxMs: 10,
    snapshotRetryMaxFailures: 1,
    snapshotFailureCooldownMs: 1000
  });

  coordinator.markWindowDirty(1);
  await waitFor(() => windowWrites === 1 && localSnapshotWrites === 1 && syncSnapshotWrites === 1 && errorCount === 1);
  await sleep(60);
  assert.equal(windowWrites, 1);

  coordinator.dispose();
});
