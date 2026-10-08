import test from "node:test";
import assert from "node:assert/strict";
import { LOCAL_WINDOW_PREFIX, SYNC_SNAPSHOT_KEY } from "../shared/constants.js";
import { PRIVATE_WINDOW_PREFIX } from "../shared/privateSessionStore.js";
import { buildSyncSnapshot, buildTreeFromTabs, moveNode } from "../shared/treeModel.js";

function tab(id, windowId = 1, index = 0, url = `https://restore.test/${id}`, incognito = false) {
  return { id, windowId, index, url, title: url, incognito, pinned: false, active: index === 0, groupId: -1 };
}

function event() {
  const listeners = [];
  return { listeners, addListener(listener) { listeners.push(listener); } };
}

function events(names) {
  return Object.fromEntries(names.map((name) => [name, event()]));
}

function area(initial = {}) {
  const values = structuredClone(initial);
  return {
    async get(keys) {
      const selected = keys === null ? Object.keys(values) : Array.isArray(keys) ? keys : [keys];
      return structuredClone(Object.fromEntries(selected.filter((key) => key in values).map((key) => [key, values[key]])));
    },
    async set(next) { Object.assign(values, structuredClone(next)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; }
  };
}

async function harness(t, tabs, { localTrees = [], privateTrees = [], snapshot = null } = {}) {
  const timers = new Map();
  let timerId = 0;
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, delay });
    return id;
  });
  t.mock.method(globalThis, "clearTimeout", (id) => timers.delete(id));
  const previousChrome = globalThis.chrome;
  t.after(() => { globalThis.chrome = previousChrome; });
  const chrome = {
    i18n: { getMessage: () => "" },
    runtime: { ...events(["onInstalled", "onStartup", "onSuspend", "onMessage"]), async sendMessage() {} },
    storage: {
      onChanged: event(),
      local: area(Object.fromEntries(localTrees.map((tree) => [`${LOCAL_WINDOW_PREFIX}${tree.windowId}`, tree]))),
      session: area(Object.fromEntries(privateTrees.map((tree) => [`${PRIVATE_WINDOW_PREFIX}${tree.windowId}`, tree]))),
      sync: area(snapshot ? { [SYNC_SNAPSHOT_KEY]: snapshot } : {})
    },
    tabs: {
      ...events(["onCreated", "onUpdated", "onMoved", "onActivated", "onRemoved", "onAttached", "onDetached", "onReplaced"]),
      async query(filter) {
        return structuredClone(tabs.filter((tab) => (!filter.windowId || tab.windowId === filter.windowId)
          && (!filter.active || tab.active)));
      },
      async get(id) {
        const found = tabs.find((tab) => tab.id === id);
        if (!found) throw new Error("Unknown tab");
        return structuredClone(found);
      }
    },
    windows: {
      ...events(["onRemoved"]),
      async getAll() {
        return [...new Set(tabs.map((tab) => tab.windowId))].map((id) => ({
          id, incognito: tabs.some((tab) => tab.windowId === id && tab.incognito),
          tabs: structuredClone(tabs.filter((tab) => tab.windowId === id))
        }));
      }
    },
    tabGroups: { ...events(["onCreated", "onUpdated", "onMoved", "onRemoved"]), async query() { return []; } },
    sidePanel: { async setPanelBehavior() {} },
    commands: events(["onCommand"])
  };
  globalThis.chrome = chrome;
  const workerUrl = new URL("../background/service_worker.js", import.meta.url);
  workerUrl.searchParams.set("recovery-test", t.name);
  await import(workerUrl.href);
  const message = (request) => new Promise((resolve) => chrome.runtime.onMessage.listeners[0](request, {}, resolve));
  const getState = async () => {
    const response = await message({ type: "GET_STATE", payload: { windowId: 1 } });
    assert.equal(response.ok, true);
    return response.payload;
  };
  await getState();
  return {
    message, getState,
    async updateTabs(nextTabs) {
      tabs.splice(0, tabs.length, ...nextTabs);
      for (const tab of nextTabs) {
        for (const listener of chrome.tabs.onUpdated.listeners) listener(tab.id, { url: tab.url, title: tab.title }, tab);
      }
      for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
    },
    async reconcile(delay) {
      const callbacks = [...timers].filter(([, timer]) => timer.delay === delay);
      assert.equal(callbacks.length, 1);
      for (const [id, timer] of callbacks) { timers.delete(id); timer.callback(); }
      for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
    }
  };
}

test("startup reconciliation preserves distinct archives for identical windows", async (t) => {
  const firstTabs = [tab(1, 1, 0, "https://same.test/a"), tab(2, 1, 1, "https://same.test/b")];
  const secondTabs = [tab(11, 2, 0, "https://same.test/a"), tab(12, 2, 1, "https://same.test/b")];
  const first = { ...moveNode(buildTreeFromTabs(firstTabs), "tab:2", "tab:1"), restoreArchiveId: "first", updatedAt: 100 };
  const second = { ...buildTreeFromTabs(secondTabs), restoreArchiveId: "second", updatedAt: 100 };
  const worker = await harness(t, [...firstTabs, ...secondTabs], { localTrees: [first, second] });

  for (const delay of [null, 2000, 6000]) {
    if (delay !== null) await worker.reconcile(delay);
    const { windows } = await worker.getState();
    assert.equal(windows[1].nodes["tab:2"].parentNodeId, "tab:1");
    assert.equal(windows[2].nodes["tab:12"].parentNodeId, null);
    assert.equal(windows[1].restoreArchiveId, "first");
    assert.equal(windows[2].restoreArchiveId, "second");
  }
});

test("startup reconciliation cannot undo a user edit before its debounced save", async (t) => {
  const tabs = [tab(1), tab(2, 1, 1)];
  const previous = moveNode(buildTreeFromTabs(tabs), "tab:2", "tab:1");
  const worker = await harness(t, tabs, { localTrees: [previous] });
  const response = await worker.message({
    type: "TREE_ACTION", payload: { type: "TOGGLE_COLLAPSE", windowId: 1, tabId: 1 }
  });
  assert.equal(response.ok, true);

  for (const delay of [2000, 6000]) {
    // The 400ms save is intentionally pending: this models an edit immediately
    // before each pre-existing startup timer, without changing scheduler policy.
    await worker.reconcile(delay);
    assert.equal((await worker.getState()).windows[1].nodes["tab:1"].collapsed, true);
  }
});

test("unrelated local history does not suppress a matching sync recovery", async (t) => {
  const tabs = [tab(1), tab(2, 1, 1)];
  const expected = moveNode(buildTreeFromTabs(tabs), "tab:2", "tab:1");
  const snapshot = buildSyncSnapshot({ 1: expected }, { maxWindows: 3, maxNodesPerWindow: 80, maxUrlLength: 220 });
  const unrelated = buildTreeFromTabs([tab(91, 9, 0), tab(92, 9, 1)]);
  const worker = await harness(t, tabs, { localTrees: [unrelated], snapshot });
  const { windows } = await worker.getState();
  assert.equal(windows[1].restoreSource, "sync");
  assert.equal(windows[1].nodes["tab:2"].parentNodeId, "tab:1");
});

test("delayed startup URLs can recover history instead of locking in an initial flat tree", async (t) => {
  const priorTabs = [tab(91, 9, 0, "https://restore.test/parent"), tab(92, 9, 1, "https://restore.test/child")];
  const previous = { ...moveNode(buildTreeFromTabs(priorTabs), "tab:92", "tab:91"), restoreArchiveId: "historical" };
  const tabs = [tab(1, 1, 0, ""), tab(2, 1, 1, "")];
  const worker = await harness(t, tabs, { localTrees: [previous] });
  assert.equal((await worker.getState()).windows[1].restoreSource, "flat");

  await worker.updateTabs([tab(1, 1, 0, priorTabs[0].url), tab(2, 1, 1, priorTabs[1].url)]);
  await worker.reconcile(400);
  await worker.reconcile(2000);

  const restored = (await worker.getState()).windows[1];
  assert.equal(restored.nodes["tab:2"].parentNodeId, "tab:1");
  assert.equal(restored.restoreArchiveId, "historical");
});

test("private windows never adopt regular archives or sync relationships", async (t) => {
  const regularTabs = [tab(1, 1, 0, "https://same.test/a"), tab(2, 1, 1, "https://same.test/b")];
  const privateTabs = [tab(11, 2, 0, "https://same.test/a", true), tab(12, 2, 1, "https://same.test/b", true)];
  const regular = moveNode(buildTreeFromTabs(regularTabs), "tab:2", "tab:1");
  const unmarkedDiskTree = moveNode(buildTreeFromTabs(privateTabs.map((tab) => ({ ...tab, incognito: false }))), "tab:12", "tab:11");
  const snapshot = buildSyncSnapshot({ 1: regular }, { maxWindows: 3, maxNodesPerWindow: 80, maxUrlLength: 220 });
  snapshot.windows[0].w = "2";
  const worker = await harness(t, [...regularTabs, ...privateTabs], { localTrees: [regular, unmarkedDiskTree], snapshot });
  for (const delay of [null, 2000, 6000]) {
    if (delay !== null) await worker.reconcile(delay);
    const { windows } = await worker.getState();
    assert.equal(windows[1].nodes["tab:2"].parentNodeId, "tab:1");
    assert.equal(windows[2].incognito, true);
    assert.equal(windows[2].nodes["tab:12"].parentNodeId, null);
  }
});

test("private session recovery is restricted to the same private window ID", async (t) => {
  const first = [tab(11, 2, 0, "https://private.test/a", true), tab(12, 2, 1, "https://private.test/b", true)];
  const other = [tab(21, 3, 0, "https://private.test/a", true), tab(22, 3, 1, "https://private.test/b", true)];
  const previous = { ...moveNode(buildTreeFromTabs(first), "tab:12", "tab:11"), incognito: true };
  const worker = await harness(t, [...first, ...other], { privateTrees: [previous] });
  const { windows } = await worker.getState();
  assert.equal(windows[2].nodes["tab:12"].parentNodeId, "tab:11");
  assert.equal(windows[3].nodes["tab:22"].parentNodeId, null);
});
