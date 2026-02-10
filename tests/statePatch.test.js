import test from "node:test";
import assert from "node:assert/strict";

import { applyRuntimeStateUpdate } from "../sidepanel/statePatch.js";

function baseState() {
  return {
    settings: { density: "comfortable" },
    windows: {
      1: { windowId: 1, rootNodeIds: [], nodes: {} },
      2: { windowId: 2, rootNodeIds: [], nodes: {} }
    },
    panelWindowId: 1,
    focusedWindowId: 1
  };
}

test("settings-only payload updates settings and requests render", () => {
  const result = applyRuntimeStateUpdate(baseState(), {
    partial: false,
    settings: { density: "compact" }
  });

  assert.equal(result.settings.density, "compact");
  assert.equal(result.shouldRender, true);
});

test("partial update for non-current window skips render", () => {
  const result = applyRuntimeStateUpdate(baseState(), {
    partial: true,
    changedWindowId: 2,
    windows: {
      2: { windowId: 2, rootNodeIds: ["tab:2"], nodes: { "tab:2": { tabId: 2 } } }
    }
  });

  assert.equal(result.windows[2].rootNodeIds[0], "tab:2");
  assert.equal(result.shouldRender, false);
});

test("partial update for current window renders", () => {
  const result = applyRuntimeStateUpdate(baseState(), {
    partial: true,
    changedWindowId: 1,
    windows: {
      1: { windowId: 1, rootNodeIds: ["tab:1"], nodes: { "tab:1": { tabId: 1 } } }
    }
  });

  assert.equal(result.shouldRender, true);
});

test("partial update renders when current window fallback changes", () => {
  const state = {
    settings: {},
    windows: {
      2: { windowId: 2, rootNodeIds: [], nodes: {} }
    },
    panelWindowId: null,
    focusedWindowId: 2
  };
  const result = applyRuntimeStateUpdate(state, {
    partial: true,
    changedWindowId: 3,
    windows: {
      3: { windowId: 3, rootNodeIds: [], nodes: {} }
    },
    focusedWindowId: 3
  });

  assert.equal(result.focusedWindowId, 3);
  assert.equal(result.shouldRender, true);
});

test("full windows payload replaces state and renders", () => {
  const result = applyRuntimeStateUpdate(baseState(), {
    partial: false,
    windows: {
      9: { windowId: 9, rootNodeIds: [], nodes: {} }
    },
    focusedWindowId: 9
  });

  assert.deepEqual(Object.keys(result.windows), ["9"]);
  assert.equal(result.focusedWindowId, 9);
  assert.equal(result.shouldRender, true);
});
