import test from "node:test";
import assert from "node:assert/strict";
import { buildTreeFromTabs, moveNode } from "../shared/treeModel.js";
import { PRIVATE_WINDOW_PREFIX } from "../shared/privateSessionStore.js";

const makeTab = (id, windowId, incognito = false) => ({
  id, windowId, incognito, index: id % 10 - 1, active: id % 10 === 1,
  pinned: false, groupId: -1, title: incognito ? "private-marker" : "Regular",
  url: `https://${incognito ? "private-marker" : "regular"}.invalid/${id}`
});
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); }, emit(...args) { for (const fn of this.listeners) fn(...args); } });
const events = (names) => Object.fromEntries(names.map((name) => [name, event()]));

async function worker(t, { tabs = [makeTab(11, 1)], session = {} } = {}) {
  let liveTabs = structuredClone(tabs);
  const timers = new Map();
  let nextTimer = 0;
  t.mock.method(globalThis, "setTimeout", (fn, delay) => { timers.set(++nextTimer, { fn, delay }); return nextTimer; });
  t.mock.method(globalThis, "clearTimeout", (id) => timers.delete(id));
  const data = { local: {}, sync: {}, session: structuredClone(session) };
  const storage = Object.fromEntries(Object.entries(data).map(([name, values]) => [name, {
    async get(keys) {
      return structuredClone(Object.fromEntries((keys === null ? Object.keys(values) : keys)
        .filter((key) => Object.hasOwn(values, key)).map((key) => [key, values[key]])));
    },
    async set(valuesToSet) { Object.assign(values, structuredClone(valuesToSet)); },
    async remove(keys) { keys.forEach((key) => delete values[key]); }
  }]));
  const previous = globalThis.chrome;
  const chrome = {
    i18n: { getMessage: () => "" },
    storage: { ...storage, onChanged: event() },
    runtime: { ...events(["onInstalled", "onStartup", "onSuspend", "onMessage"]), async sendMessage() {} },
    tabs: {
      ...events(["onCreated", "onUpdated", "onMoved", "onActivated", "onRemoved", "onAttached", "onDetached", "onReplaced"]),
      async query(filter) { return structuredClone(liveTabs.filter((tab) => (!filter.windowId || tab.windowId === filter.windowId) && (!filter.active || tab.active))); },
      async get(id) { const tab = liveTabs.find((value) => value.id === id); if (!tab) throw new Error("Missing tab"); return structuredClone(tab); }
    },
    windows: { onRemoved: event(), async getAll() {
      return [...new Set(liveTabs.map((tab) => tab.windowId))].map((id) => ({
        id, incognito: liveTabs.some((tab) => tab.windowId === id && tab.incognito), tabs: liveTabs.filter((tab) => tab.windowId === id)
      }));
    } },
    tabGroups: { ...events(["onCreated", "onUpdated", "onMoved", "onRemoved"]), async query() { return []; } },
    commands: { onCommand: event() }, sidePanel: { async setPanelBehavior() {} }
  };
  globalThis.chrome = chrome;
  t.after(() => { globalThis.chrome = previous; });
  const url = new URL("../background/service_worker.js", import.meta.url);
  url.searchParams.set("test", t.name);
  await import(url.href);
  const state = async (windowId) => new Promise((resolve) => chrome.runtime.onMessage.listeners[0](
    { type: "GET_STATE", payload: { windowId } }, {}, (response) => resolve(response.payload)
  ));
  await state(1);
  const drain = () => new Promise((resolve) => setImmediate(resolve));
  const runTimers = async (delay) => {
    for (const [id, timer] of [...timers]) {
      if (timer.delay !== delay) continue;
      timers.delete(id);
      timer.fn();
    }
    await drain();
  };
  return {
    chrome, data, state, drain, runTimers,
    setTabs(value) { liveTabs = value; },
    flush: () => runTimers(400)
  };
}

test("private onCreated events persist only in session and window close removes their state", async (t) => {
  const instance = await worker(t);
  const privateTab = makeTab(21, 2, true);
  instance.setTabs([makeTab(11, 1), privateTab]);
  instance.chrome.tabs.onCreated.emit(privateTab);
  await instance.drain();
  await instance.flush();
  assert.ok(instance.data.session[`${PRIVATE_WINDOW_PREFIX}2`]);
  assert.equal(JSON.stringify(instance.data.local).includes("private-marker"), false);
  assert.equal(JSON.stringify(instance.data.sync).includes("private-marker"), false);

  instance.setTabs([makeTab(11, 1)]);
  instance.chrome.tabs.onRemoved.emit(21, { windowId: 2, isWindowClosing: true });
  instance.chrome.windows.onRemoved.emit(2);
  await instance.drain();
  await instance.flush();
  assert.equal(instance.data.session[`${PRIVATE_WINDOW_PREFIX}2`], undefined);
  assert.equal(JSON.stringify(instance.data).includes("private-marker"), false);
});

test("worker startup restores private hierarchy only from the same live session window", async (t) => {
  const privateTabs = [makeTab(21, 2, true), makeTab(22, 2, true)];
  const previous = moveNode(buildTreeFromTabs(privateTabs), "tab:22", "tab:21");
  const stale = { ...previous, windowId: 99 };
  const instance = await worker(t, {
    tabs: [makeTab(11, 1), ...privateTabs],
    session: { [`${PRIVATE_WINDOW_PREFIX}2`]: previous, [`${PRIVATE_WINDOW_PREFIX}99`]: stale }
  });
  const current = (await instance.state(2)).windows[2];
  assert.equal(current.incognito, true);
  assert.equal(current.nodes["tab:22"].parentNodeId, "tab:21");
  assert.equal(instance.data.session[`${PRIVATE_WINDOW_PREFIX}99`], undefined);
  assert.equal(JSON.stringify(instance.data.local).includes("private-marker"), false);
  await instance.flush();
  assert.equal(JSON.stringify(instance.data.sync).includes("private-marker"), false);
});

test("a persistence flush during private-window cleanup cannot recreate its session record", async (t) => {
  const instance = await worker(t, {
    tabs: [makeTab(11, 1), makeTab(21, 2, true)],
    session: { unrelated: "keep" }
  });
  const remove = instance.chrome.storage.session.remove;
  let release;
  const pendingRemoval = new Promise((resolve) => { release = resolve; });
  let removalStarted = false;
  instance.chrome.storage.session.remove = async (keys) => {
    removalStarted = true;
    await pendingRemoval;
    return remove(keys);
  };

  try {
    instance.setTabs([makeTab(11, 1)]);
    instance.chrome.tabs.onRemoved.emit(21, { windowId: 2, isWindowClosing: true });
    instance.chrome.windows.onRemoved.emit(2);
    await instance.drain();
    assert.equal(removalStarted, true);
    // The final tab event schedules a save. Let it run while removal is still
    // waiting, so a stale private tree would otherwise queue after the delete.
    await instance.flush();
  } finally {
    release();
    await instance.drain();
    await instance.drain();
  }

  assert.equal((await instance.state(1)).windows[2], undefined);
  assert.equal(instance.data.session[`${PRIVATE_WINDOW_PREFIX}2`], undefined);
  assert.equal(instance.data.session.unrelated, "keep");
  assert.equal(JSON.stringify(instance.data).includes("private-marker"), false);
});

test("late startup metadata cannot restore a private window after it closes", async (t) => {
  const privateTabs = [makeTab(21, 2, true), makeTab(22, 2, true)];
  const previous = moveNode(buildTreeFromTabs(privateTabs), "tab:22", "tab:21");
  const instance = await worker(t, {
    tabs: [makeTab(11, 1), ...privateTabs],
    session: { [`${PRIVATE_WINDOW_PREFIX}2`]: previous }
  });
  let release;
  const pendingMetadata = new Promise((resolve) => { release = resolve; });
  let metadataStarted = false;
  instance.chrome.tabGroups.query = async ({ windowId }) => {
    if (windowId === 2) {
      metadataStarted = true;
      await pendingMetadata;
    }
    return [];
  };

  try {
    await instance.runTimers(2000);
    assert.equal(metadataStarted, true);
    instance.setTabs([makeTab(11, 1)]);
    for (const tab of privateTabs) {
      instance.chrome.tabs.onRemoved.emit(tab.id, { windowId: 2, isWindowClosing: true });
    }
    instance.chrome.windows.onRemoved.emit(2);
    await instance.drain();
    assert.equal((await instance.state(1)).windows[2], undefined);
  } finally {
    release();
    await instance.drain();
    await instance.drain();
  }

  await instance.flush();
  assert.equal((await instance.state(1)).windows[2], undefined);
  assert.equal(instance.data.session[`${PRIVATE_WINDOW_PREFIX}2`], undefined);
  assert.equal(JSON.stringify(instance.data).includes("private-marker"), false);
});
