import test from "node:test";
import assert from "node:assert/strict";

import { LOCAL_WINDOW_PREFIX } from "../shared/constants.js";
import { buildTreeFromTabs, moveNode, toggleNodeCollapsed } from "../shared/treeModel.js";

function tab(id, overrides = {}) {
  return {
    id, windowId: 1, index: id - 1, active: id === 1, pinned: false,
    groupId: -1, title: `Tab ${id}`, url: `https://example.com/${id}`,
    ...overrides
  };
}

function event() {
  return {
    listeners: [],
    addListener(listener) { this.listeners.push(listener); },
    emit(...args) { this.listeners.forEach((listener) => listener(...args)); }
  };
}

function events(names) {
  return Object.fromEntries(names.map((name) => [name, event()]));
}

function storage(initial = {}) {
  const data = structuredClone(initial);
  return {
    async get(keys) {
      return structuredClone(keys === null ? data : Object.fromEntries(
        (keys || []).filter((key) => key in data).map((key) => [key, data[key]])
      ));
    },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(keys) { keys.forEach((key) => delete data[key]); }
  };
}

async function workerHarness(t, tabs, previousTree = null) {
  let liveTabs = structuredClone(tabs);
  const timers = new Map();
  let timerId = 0;
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, delay });
    return id;
  });
  t.mock.method(globalThis, "clearTimeout", (id) => timers.delete(id));
  const previousChrome = globalThis.chrome;
  t.after(() => {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  });
  const chrome = {
    i18n: { getMessage: () => "" },
    runtime: { ...events(["onInstalled", "onStartup", "onSuspend", "onMessage"]), async sendMessage() {} },
    storage: {
      sync: storage(),
      local: storage(previousTree ? { [`${LOCAL_WINDOW_PREFIX}1`]: previousTree } : {})
    },
    tabs: {
      ...events(["onCreated", "onUpdated", "onMoved", "onActivated", "onRemoved", "onAttached", "onDetached", "onReplaced"]),
      async query(filter) {
        return structuredClone(liveTabs.filter((candidate) =>
          (!filter.windowId || candidate.windowId === filter.windowId) && (!filter.active || candidate.active)
        ));
      },
      async get(id) {
        const found = liveTabs.find((candidate) => candidate.id === id);
        if (!found) throw new Error(`No tab with id: ${id}`);
        return structuredClone(found);
      }
    },
    windows: { ...events(["onRemoved"]), async getAll() { return [{ id: 1, tabs: structuredClone(liveTabs) }]; } },
    tabGroups: { ...events(["onCreated", "onUpdated", "onMoved", "onRemoved"]), async query() { return []; } },
    commands: events(["onCommand"]),
    sidePanel: { async setPanelBehavior() {} }
  };
  globalThis.chrome = chrome;
  const workerUrl = new URL("../background/service_worker.js", import.meta.url);
  workerUrl.searchParams.set("test", t.name);
  await import(workerUrl.href);
  const drain = () => new Promise((resolve) => setImmediate(resolve));
  const getTree = async () => {
    const response = await new Promise((resolve) => chrome.runtime.onMessage.listeners[0](
      { type: "GET_STATE", payload: { windowId: 1 } }, {}, resolve
    ));
    assert.equal(response.ok, true);
    return structuredClone(response.payload.windows[1]);
  };
  await getTree();
  // Simulate normal use after startup; advance order-sync timers explicitly.
  timers.clear();
  return {
    getTree,
    setTabs(next) { liveTabs = structuredClone(next); },
    async emit(name, ...args) { chrome.tabs[name].emit(...args); await drain(); },
    async syncOrdering() {
      const scheduled = [...timers].filter(([, timer]) => timer.delay === 90);
      assert.ok(scheduled.length, "a live-tab reconciliation must be scheduled");
      for (const [id, timer] of scheduled) {
        timers.delete(id);
        timer.callback();
      }
      await drain();
    }
  };
}

test("worker replaces a tab ID in place and preserves its subtree before and after reconciliation", async (t) => {
  const tabs = [tab(1), tab(2), tab(3)];
  let previous = moveNode(buildTreeFromTabs(tabs), "tab:2", "tab:1");
  previous = toggleNodeCollapsed(previous, "tab:1");
  const worker = await workerHarness(t, tabs, previous);
  const replacement = tab(11, { index: 0, active: true, title: "Tab 1" });
  worker.setTabs([replacement, tabs[1], tabs[2]]);
  await worker.emit("onReplaced", 11, 1);
  await worker.emit("onUpdated", 11, { status: "complete" }, replacement);

  for (let pass = 0; pass < 2; pass++) {
    const tree = await worker.getTree();
    assert.equal(tree.nodes["tab:1"], undefined);
    assert.deepEqual(tree.rootNodeIds, ["tab:11", "tab:3"]);
    assert.deepEqual(tree.nodes["tab:11"].childNodeIds, ["tab:2"]);
    assert.equal(tree.nodes["tab:2"].parentNodeId, "tab:11");
    assert.equal(tree.nodes["tab:11"].collapsed, true);
    assert.equal(tree.selectedTabId, 11);
    if (pass === 0) await worker.syncOrdering();
  }
});

test("worker merges an update that arrives before the replacement notification", async (t) => {
  const oldTab = tab(1);
  const worker = await workerHarness(t, [oldTab]);
  const replacement = tab(11, { index: 0, active: true, title: oldTab.title });
  worker.setTabs([replacement]);
  await worker.emit("onUpdated", 11, { title: replacement.title }, replacement);
  await worker.emit("onReplaced", 11, 1);
  const tree = await worker.getTree();
  assert.deepEqual(Object.keys(tree.nodes), ["tab:11"]);
  assert.deepEqual(tree.rootNodeIds, ["tab:11"]);
});

test("worker rejects a stale update for the removed ID instead of resurrecting its row", async (t) => {
  const oldTab = tab(1);
  const worker = await workerHarness(t, [oldTab]);
  worker.setTabs([tab(11, { index: 0, active: true })]);
  await worker.emit("onReplaced", 11, 1);
  await worker.emit("onUpdated", 1, { status: "complete" }, oldTab);
  assert.deepEqual(Object.keys((await worker.getTree()).nodes), ["tab:11"]);
});

test("worker schedules reconciliation for an unknown update even without index or group changes", async (t) => {
  const oldTab = tab(1);
  const worker = await workerHarness(t, [oldTab]);
  const replacement = tab(11, { index: 0, active: true, title: oldTab.title });
  worker.setTabs([replacement]);
  await worker.emit("onUpdated", 11, { title: replacement.title }, replacement);
  await worker.syncOrdering();
  const tree = await worker.getTree();
  assert.deepEqual(Object.keys(tree.nodes), ["tab:11"]);
  assert.deepEqual(tree.rootNodeIds, ["tab:11"]);
});

test("worker cleans up a replacement that closed before its event was processed", async (t) => {
  const tabs = [tab(1), tab(2)];
  const previous = moveNode(buildTreeFromTabs(tabs), "tab:2", "tab:1");
  const worker = await workerHarness(t, tabs, previous);
  worker.setTabs([tab(2, { index: 0, active: true })]);
  await worker.emit("onReplaced", 11, 1);
  await worker.syncOrdering();
  const tree = await worker.getTree();
  assert.deepEqual(Object.keys(tree.nodes), ["tab:2"]);
  assert.deepEqual(tree.rootNodeIds, ["tab:2"]);
  assert.equal(tree.selectedTabId, 2);
});
