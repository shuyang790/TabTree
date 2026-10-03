import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_SETTINGS, LOCAL_WINDOW_PREFIX, SETTINGS_KEY } from "../shared/constants.js";
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

function storage(initial = {}, onChanged = () => {}) {
  const data = structuredClone(initial);
  return {
    async get(keys) {
      return structuredClone(keys === null ? data : Object.fromEntries(
        (keys || []).filter((key) => key in data).map((key) => [key, data[key]])
      ));
    },
    async set(values) {
      const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) =>
        [key, { oldValue: structuredClone(data[key]), newValue: structuredClone(newValue) }]));
      Object.assign(data, structuredClone(values));
      onChanged(changes);
    },
    setWithoutEvent(values) { Object.assign(data, structuredClone(values)); },
    async remove(keys) {
      const changes = Object.fromEntries(keys.map((key) => [key, { oldValue: structuredClone(data[key]) }]));
      keys.forEach((key) => delete data[key]);
      onChanged(changes);
    }
  };
}

async function workerHarness(t, tabs, previousTree = null, options = {}) {
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
  const broadcasts = [];
  const storageChanged = event();
  const chrome = {
    i18n: { getMessage: () => "" },
    runtime: {
      ...events(["onInstalled", "onStartup", "onSuspend", "onMessage"]),
      async sendMessage(message) { broadcasts.push(structuredClone(message)); }
    },
    storage: {
      onChanged: storageChanged,
      sync: storage(options.settings ? { [SETTINGS_KEY]: options.settings } : {},
        (changes) => storageChanged.emit(changes, "sync")),
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
    windows: {
      ...events(["onRemoved"]),
      async getAll() {
        if (options.duringInitialization) await options.duringInitialization(chrome);
        return [{ id: 1, tabs: structuredClone(liveTabs) }];
      }
    },
    tabGroups: { ...events(["onCreated", "onUpdated", "onMoved", "onRemoved"]), async query() { return []; } },
    commands: events(["onCommand"]),
    sidePanel: { async setPanelBehavior() {} }
  };
  globalThis.chrome = chrome;
  const workerUrl = new URL("../background/service_worker.js", import.meta.url);
  workerUrl.searchParams.set("test", t.name);
  await import(workerUrl.href);
  const drain = () => new Promise((resolve) => setImmediate(resolve));
  const message = (request) => new Promise((resolve) => chrome.runtime.onMessage.listeners[0](request, {}, resolve));
  const getState = async () => {
    const response = await message({ type: "GET_STATE", payload: { windowId: 1 } });
    assert.equal(response.ok, true);
    return structuredClone(response.payload);
  };
  const getTree = async () => (await getState()).windows[1];
  await getTree();
  // Simulate normal use after startup; advance order-sync timers explicitly.
  timers.clear();
  return {
    chrome,
    broadcasts,
    drain,
    message,
    getState,
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

test("worker applies synced settings to its cache and broadcasts without rewriting sync", async (t) => {
  const worker = await workerHarness(t, [tab(1)], null, { settings: { ...DEFAULT_SETTINGS, indentPx: 16 } });
  const setSpy = t.mock.method(worker.chrome.storage.sync, "set");
  await worker.chrome.storage.sync.set({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, indentPx: 26 } });
  await worker.drain();
  assert.equal((await worker.getState()).settings.indentPx, 26);
  assert.equal(setSpy.mock.callCount(), 1, "the change listener must not create a sync write loop");
  assert.ok(worker.broadcasts.some(({ payload }) => payload?.settings?.indentPx === 26 && payload.windows === undefined));
});

test("local settings patches merge durable changes even before their change notification arrives", async (t) => {
  const worker = await workerHarness(t, [tab(1)]);
  worker.chrome.storage.sync.setWithoutEvent({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, indentPx: 26, themePresetDark: "gruvbox-dark" } });
  const response = await worker.message({ type: "PATCH_SETTINGS", payload: { settingsPatch: { showCloseButton: false } } });
  assert.equal(response.ok, true);
  const saved = (await worker.chrome.storage.sync.get([SETTINGS_KEY]))[SETTINGS_KEY];
  assert.equal(saved.indentPx, 26);
  assert.equal(saved.themePresetDark, "gruvbox-dark");
  assert.equal(saved.showCloseButton, false);
  assert.deepEqual(response.payload, saved);
});

test("queued patches and delayed own change events cannot restore stale settings", async (t) => {
  const worker = await workerHarness(t, [tab(1)]);
  const responses = await Promise.all([
    worker.message({ type: "PATCH_SETTINGS", payload: { settingsPatch: { indentPx: 27 } } }),
    worker.message({ type: "PATCH_SETTINGS", payload: { settingsPatch: { showCloseButton: false } } })
  ]);
  assert.ok(responses.every((response) => response.ok));
  worker.chrome.storage.onChanged.emit({ [SETTINGS_KEY]: { newValue: DEFAULT_SETTINGS } }, "sync");
  await worker.drain();
  const settings = (await worker.getState()).settings;
  assert.equal(settings.indentPx, 27);
  assert.equal(settings.showCloseButton, false);
});

test("settings changes during asynchronous startup are applied after hydration", async (t) => {
  const worker = await workerHarness(t, [tab(1)], null, {
    settings: { ...DEFAULT_SETTINGS, indentPx: 12 },
    duringInitialization: async (chrome) => {
      await chrome.storage.sync.set({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, indentPx: 25 } });
    }
  });
  await worker.drain();
  assert.equal((await worker.getState()).settings.indentPx, 25);
});

test("removing synced settings restores defaults and local-area changes are ignored", async (t) => {
  const worker = await workerHarness(t, [tab(1)], null, { settings: { ...DEFAULT_SETTINGS, indentPx: 26 } });
  worker.chrome.storage.onChanged.emit({ [SETTINGS_KEY]: { newValue: DEFAULT_SETTINGS } }, "local");
  await worker.drain();
  assert.equal((await worker.getState()).settings.indentPx, 26);
  await worker.chrome.storage.sync.remove([SETTINGS_KEY]);
  await worker.drain();
  assert.deepEqual((await worker.getState()).settings, DEFAULT_SETTINGS);
});

for (const action of ["CLOSE_SUBTREE", "BATCH_CLOSE_SUBTREES", "BATCH_CLOSE_TABS"]) {
  test(`${action} preserves still-live tabs and reports a rejected browser close`, async (t) => {
    t.mock.method(console, "warn", () => {});
    const tabs = [tab(1), tab(2), tab(3)];
    const previous = moveNode(buildTreeFromTabs(tabs), "tab:2", "tab:1");
    const worker = await workerHarness(t, tabs, previous);
    const before = await worker.getTree();
    worker.chrome.tabs.remove = async () => { throw new Error("Tabs cannot be edited right now"); };
    const payload = action === "CLOSE_SUBTREE"
      ? { type: action, tabId: 1, includeDescendants: true }
      : { type: action, tabIds: [1] };
    const response = await worker.message({ type: "TREE_ACTION", payload });
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "TREE_ACTION_FAILED");
    assert.match(response.error.message, /cannot be edited/);
    assert.deepEqual((await worker.getTree()).nodes, before.nodes);
    assert.deepEqual((await worker.getTree()).rootNodeIds, before.rootNodeIds);
  });
}

for (const action of ["CLOSE_SUBTREE", "BATCH_CLOSE_SUBTREES"]) {
  test(`${action} reconciles partial browser removal while preserving surviving hierarchy`, async (t) => {
    t.mock.method(console, "warn", () => {});
    const tabs = [tab(1), tab(2), tab(3), tab(4)];
    let previous = moveNode(buildTreeFromTabs(tabs), "tab:2", "tab:1");
    previous = moveNode(previous, "tab:3", "tab:1");
    const worker = await workerHarness(t, tabs, previous);
    worker.chrome.tabs.remove = async () => {
      worker.setTabs([tabs[0], tabs[2], tabs[3]]);
      throw new Error("Partial close failure");
    };
    const payload = action === "CLOSE_SUBTREE"
      ? { type: action, tabId: 1, includeDescendants: true }
      : { type: action, tabIds: [1] };
    const response = await worker.message({ type: "TREE_ACTION", payload });
    const tree = await worker.getTree();
    assert.equal(response.ok, false);
    assert.equal(tree.nodes["tab:2"], undefined);
    assert.equal(tree.nodes["tab:3"].parentNodeId, "tab:1");
    assert.deepEqual(tree.nodes["tab:1"].childNodeIds, ["tab:3"]);
    assert.deepEqual(tree.rootNodeIds, ["tab:1", "tab:4"]);
  });
}

test("successful subtree close prunes only tabs Chrome actually removed", async (t) => {
  const tabs = [tab(1), tab(2), tab(3)];
  const previous = moveNode(buildTreeFromTabs(tabs), "tab:2", "tab:1");
  const worker = await workerHarness(t, tabs, previous);
  worker.chrome.tabs.remove = async (ids) => {
    assert.deepEqual(ids, [1, 2]);
    worker.setTabs([tabs[2]]);
  };
  const response = await worker.message({ type: "TREE_ACTION", payload: { type: "CLOSE_SUBTREE", tabId: 1 } });
  assert.equal(response.ok, true);
  assert.deepEqual(Object.keys((await worker.getTree()).nodes), ["tab:3"]);
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
