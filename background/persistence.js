import { STORAGE_WRITE_DEBOUNCE_MS } from "../shared/constants.js";

export function createPersistCoordinator({
  saveWindowTree,
  saveSyncSnapshot,
  saveLocalSnapshot = async () => {},
  saveRestoreArchive = async () => {},
  getWindowsState,
  onError = () => {},
  flushDebounceMs = STORAGE_WRITE_DEBOUNCE_MS,
  snapshotMinIntervalMs = 2000,
  heavySnapshotMinIntervalMs = 30000,
  retryBaseMs = 500,
  retryMaxMs = 4000,
  snapshotRetryMaxFailures = 3,
  snapshotFailureCooldownMs = 5 * 60 * 1000
}) {
  const dirtyWindowIds = new Set();
  let syncSnapshotDirty = false;
  let heavySnapshotDirty = false;
  let flushTimer = null;
  let flushInFlight = false;
  let windowRetryDelayMs = retryBaseMs;
  let snapshotRetryDelayMs = retryBaseMs;
  let snapshotFailureCount = 0;
  let snapshotsPausedUntil = 0;
  let lastSyncSnapshotAt = 0;
  let lastHeavySnapshotAt = 0;

  function scheduleFlush(delayMs) {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushPending();
    }, delayMs);
  }

  async function flushNow() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await flushPending();
  }

  function pendingSnapshotWaitMs(now = Date.now()) {
    if (!syncSnapshotDirty && !heavySnapshotDirty) {
      return null;
    }
    if (snapshotsPausedUntil > now) {
      return snapshotsPausedUntil - now;
    }

    const waits = [];
    if (syncSnapshotDirty) {
      waits.push(Math.max(0, snapshotMinIntervalMs - (now - lastSyncSnapshotAt)));
    }
    if (heavySnapshotDirty) {
      waits.push(Math.max(0, heavySnapshotMinIntervalMs - (now - lastHeavySnapshotAt)));
    }
    return waits.length ? Math.min(...waits) : null;
  }

  function nextPendingDelayMs() {
    if (dirtyWindowIds.size > 0) {
      return flushDebounceMs;
    }
    return pendingSnapshotWaitMs();
  }

  function handleSnapshotFailure(error) {
    onError(error, { phase: "snapshot" });
    snapshotFailureCount += 1;
    if (snapshotFailureCount >= snapshotRetryMaxFailures) {
      snapshotsPausedUntil = Date.now() + snapshotFailureCooldownMs;
      snapshotFailureCount = 0;
      snapshotRetryDelayMs = retryBaseMs;
      scheduleFlush(snapshotFailureCooldownMs);
      return;
    }

    snapshotRetryDelayMs = Math.min(snapshotRetryDelayMs * 2, retryMaxMs);
    scheduleFlush(snapshotRetryDelayMs);
  }

  async function flushSnapshots(windowsState) {
    const now = Date.now();
    if (!syncSnapshotDirty && !heavySnapshotDirty) {
      return;
    }
    if (snapshotsPausedUntil > now) {
      scheduleFlush(snapshotsPausedUntil - now);
      return;
    }

    const syncDue = syncSnapshotDirty && (now - lastSyncSnapshotAt) >= snapshotMinIntervalMs;
    const heavyDue = heavySnapshotDirty && (now - lastHeavySnapshotAt) >= heavySnapshotMinIntervalMs;
    if (!syncDue && !heavyDue) {
      const waitMs = pendingSnapshotWaitMs(now);
      if (Number.isFinite(waitMs)) {
        scheduleFlush(waitMs);
      }
      return;
    }

    const errors = [];
    if (heavyDue) {
      try {
        await saveLocalSnapshot(windowsState);
        await saveRestoreArchive(windowsState);
        heavySnapshotDirty = false;
        lastHeavySnapshotAt = Date.now();
      } catch (error) {
        errors.push(error);
      }
    }

    if (syncDue) {
      try {
        await saveSyncSnapshot(windowsState);
        syncSnapshotDirty = false;
        lastSyncSnapshotAt = Date.now();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length) {
      handleSnapshotFailure(errors[0]);
      return;
    }

    snapshotFailureCount = 0;
    snapshotRetryDelayMs = retryBaseMs;
  }

  async function flushPending() {
    if (flushInFlight) {
      scheduleFlush(flushDebounceMs);
      return;
    }

    flushInFlight = true;
    let pendingWindowIds = [];
    try {
      const windowsState = getWindowsState();
      const writeTasks = [];
      pendingWindowIds = Array.from(dirtyWindowIds);
      dirtyWindowIds.clear();

      for (const windowId of pendingWindowIds) {
        const tree = windowsState[windowId];
        if (tree) {
          writeTasks.push(saveWindowTree(tree));
        }
      }
      if (writeTasks.length) {
        await Promise.all(writeTasks);
      }

      windowRetryDelayMs = retryBaseMs;
      await flushSnapshots(windowsState);
    } catch (error) {
      for (const windowId of pendingWindowIds) {
        dirtyWindowIds.add(windowId);
      }
      onError(error, { phase: "window" });
      windowRetryDelayMs = Math.min(windowRetryDelayMs * 2, retryMaxMs);
      scheduleFlush(windowRetryDelayMs);
    } finally {
      flushInFlight = false;
      if (!flushTimer) {
        const pendingDelayMs = nextPendingDelayMs();
        if (Number.isFinite(pendingDelayMs)) {
          scheduleFlush(pendingDelayMs);
        }
      }
    }
  }

  function markWindowDirty(windowId) {
    if (Number.isInteger(windowId)) {
      dirtyWindowIds.add(windowId);
    }
    syncSnapshotDirty = true;
    heavySnapshotDirty = true;
    scheduleFlush(flushDebounceMs);
  }

  function markSnapshotDirty() {
    syncSnapshotDirty = true;
    heavySnapshotDirty = true;
    scheduleFlush(flushDebounceMs);
  }

  function forgetWindow(windowId) {
    dirtyWindowIds.delete(windowId);
    syncSnapshotDirty = true;
    heavySnapshotDirty = true;
    scheduleFlush(flushDebounceMs);
  }

  function dispose() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    dirtyWindowIds.clear();
    syncSnapshotDirty = false;
    heavySnapshotDirty = false;
  }

  return {
    dispose,
    flushNow,
    flushSoon: () => scheduleFlush(flushDebounceMs),
    forgetWindow,
    markSnapshotDirty,
    markWindowDirty
  };
}
