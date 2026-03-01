function ensureWindowState(states, windowId) {
  let state = states.get(windowId);
  if (!state) {
    state = {
      timer: null,
      inFlight: false,
      rerunRequested: false,
      runPromise: null
    };
    states.set(windowId, state);
  }
  return state;
}

function cleanupWindowState(states, windowId, state, clearTimer) {
  if (state.timer) {
    clearTimer(state.timer);
  }
  if (state.timer || state.inFlight || state.rerunRequested || state.runPromise) {
    return;
  }
  states.delete(windowId);
}

export function createWindowOrderSyncCoordinator({
  delayMs = 90,
  runSync,
  onError = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  if (typeof runSync !== "function") {
    throw new TypeError("createWindowOrderSyncCoordinator requires a runSync function");
  }

  const states = new Map();

  async function runNow(windowId) {
    if (!Number.isInteger(windowId)) {
      return;
    }

    const state = ensureWindowState(states, windowId);
    if (state.timer) {
      clearTimer(state.timer);
      state.timer = null;
    }

    if (state.inFlight) {
      state.rerunRequested = true;
      return state.runPromise || Promise.resolve();
    }

    state.inFlight = true;
    state.runPromise = (async () => {
      do {
        state.rerunRequested = false;
        try {
          await runSync(windowId);
        } catch (error) {
          onError(error, { windowId });
        }
      } while (state.rerunRequested);
    })()
      .finally(() => {
        state.inFlight = false;
        state.runPromise = null;
        cleanupWindowState(states, windowId, state, clearTimer);
      });

    return state.runPromise;
  }

  function schedule(windowId, requestedDelayMs = delayMs) {
    if (!Number.isInteger(windowId)) {
      return;
    }

    const state = ensureWindowState(states, windowId);
    if (state.timer) {
      clearTimer(state.timer);
    }
    const ms = Number.isFinite(requestedDelayMs) ? Math.max(0, requestedDelayMs) : delayMs;
    state.timer = setTimer(() => {
      state.timer = null;
      void runNow(windowId);
    }, ms);
  }

  function cancel(windowId) {
    if (!Number.isInteger(windowId)) {
      return;
    }
    const state = states.get(windowId);
    if (!state) {
      return;
    }
    if (state.timer) {
      clearTimer(state.timer);
      state.timer = null;
    }
    state.rerunRequested = false;
    cleanupWindowState(states, windowId, state, clearTimer);
  }

  function dispose() {
    for (const [windowId, state] of states.entries()) {
      if (state.timer) {
        clearTimer(state.timer);
        state.timer = null;
      }
      state.rerunRequested = false;
      cleanupWindowState(states, windowId, state, clearTimer);
    }
  }

  function trackedWindowCount() {
    return states.size;
  }

  return {
    cancel,
    dispose,
    runNow,
    schedule,
    trackedWindowCount
  };
}
