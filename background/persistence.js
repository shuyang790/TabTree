import { STORAGE_WRITE_DEBOUNCE_MS } from "../shared/constants.js";

export function createPersistCoordinator({
  saveWindowTree,
  saveSyncSnapshot,
  getWindowsState,
  onError = () => {},
  flushDebounceMs = STORAGE_WRITE_DEBOUNCE_MS,
  snapshotMinIntervalMs = 2000,
  retryBaseMs = 500,
  retryMaxMs = 4000
}) {
  const dirtyWindowIds = new Set();
  let snapshotDirty = false;
  let flushTimer = null;
  let flushInFlight = false;
  let retryDelayMs = retryBaseMs;
  let lastSnapshotAt = 0;

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

      if (snapshotDirty) {
        const now = Date.now();
        const waitMs = snapshotMinIntervalMs - (now - lastSnapshotAt);
        if (waitMs > 0) {
          scheduleFlush(waitMs);
        } else {
          await saveSyncSnapshot(windowsState);
          snapshotDirty = false;
          lastSnapshotAt = Date.now();
        }
      }

      retryDelayMs = retryBaseMs;
    } catch (error) {
      for (const windowId of pendingWindowIds) {
        dirtyWindowIds.add(windowId);
      }
      onError(error);
      retryDelayMs = Math.min(retryDelayMs * 2, retryMaxMs);
      scheduleFlush(retryDelayMs);
    } finally {
      flushInFlight = false;
      if ((dirtyWindowIds.size > 0 || snapshotDirty) && !flushTimer) {
        scheduleFlush(flushDebounceMs);
      }
    }
  }

  function markWindowDirty(windowId) {
    if (Number.isInteger(windowId)) {
      dirtyWindowIds.add(windowId);
    }
    snapshotDirty = true;
    scheduleFlush(flushDebounceMs);
  }

  function markSnapshotDirty() {
    snapshotDirty = true;
    scheduleFlush(flushDebounceMs);
  }

  function forgetWindow(windowId) {
    dirtyWindowIds.delete(windowId);
    snapshotDirty = true;
    scheduleFlush(flushDebounceMs);
  }

  function dispose() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    dirtyWindowIds.clear();
    snapshotDirty = false;
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
