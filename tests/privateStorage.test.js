import test from "node:test";
import assert from "node:assert/strict";
import { buildTreeFromTabs, moveNode, removeNodePromoteChildren } from "../shared/treeModel.js";
import { LOCAL_WINDOW_PREFIX, LOCAL_SNAPSHOT_KEY, LOCAL_RESTORE_ARCHIVE_KEY, SYNC_SNAPSHOT_KEY } from "../shared/constants.js";
import {
  loadAllWindowTrees, loadWindowTree, migrateLocalStorage, removeWindowTree,
  saveWindowTree, saveWindowTrees, saveLocalSnapshot, saveRestoreArchive, saveSyncSnapshot
} from "../shared/treeStore.js";
import {
  PRIVATE_WINDOW_PREFIX, isPrivateTree, loadPrivateWindowTrees,
  prunePrivateWindowTrees, removePrivateWindowTree, savePrivateWindowTrees
} from "../shared/privateSessionStore.js";

function mockStorage(t, initial = {}) {
  const previous = globalThis.chrome;
  const data = Object.fromEntries(["local", "sync", "session"].map((name) => [name, structuredClone(initial[name] || {})]));
  const storage = Object.fromEntries(Object.entries(data).map(([name, values]) => [name, {
    async get(keys) {
      const selected = keys === null ? Object.keys(values) : Array.isArray(keys) ? keys : [keys];
      return structuredClone(Object.fromEntries(selected.filter((key) => Object.hasOwn(values, key)).map((key) => [key, values[key]])));
    },
    async set(updates) { Object.assign(values, structuredClone(updates)); },
    async remove(keys) { for (const key of keys) delete values[key]; }
  }]));
  globalThis.chrome = { storage };
  t.after(() => { globalThis.chrome = previous; });
  return data;
}

function tree(windowId, incognito = false) {
  const tabs = [1, 2].map((id) => ({
    id: windowId * 10 + id, windowId, index: id - 1, active: id === 1,
    incognito, pinned: false, groupId: -1,
    title: `${incognito ? "private-marker" : "regular"} ${id}`,
    url: `https://${incognito ? "private-marker" : "regular"}.invalid/${id}`
  }));
  return moveNode(buildTreeFromTabs(tabs), `tab:${windowId * 10 + 2}`, `tab:${windowId * 10 + 1}`);
}

test("private trees survive worker reload reads in session, absent from all persistent writers", async (t) => {
  const data = mockStorage(t);
  const windows = { 1: tree(1), 2: tree(2, true) };
  await saveWindowTrees(windows);
  await saveLocalSnapshot(windows);
  await saveRestoreArchive(windows);
  await saveSyncSnapshot(windows);
  assert.equal(JSON.stringify(data.local).includes("private-marker"), false);
  assert.equal(JSON.stringify(data.sync).includes("private-marker"), false);
  assert.ok(JSON.stringify(data.session).includes("private-marker"));
  assert.ok(data.local[`${LOCAL_WINDOW_PREFIX}1`]);
  assert.equal(data.local[`${LOCAL_WINDOW_PREFIX}2`], undefined);
  assert.equal((await loadWindowTree(2)).nodes["tab:22"].parentNodeId, "tab:21");
  assert.equal((await loadAllWindowTrees()).length, 2);
});

test("privacy remains attached after the final private tab is removed", async (t) => {
  const data = mockStorage(t);
  let privateTree = tree(2, true);
  privateTree = removeNodePromoteChildren(privateTree, "tab:22");
  privateTree = removeNodePromoteChildren(privateTree, "tab:21");
  assert.equal(isPrivateTree(privateTree), true);
  await saveWindowTree(privateTree);
  assert.equal(data.local[`${LOCAL_WINDOW_PREFIX}2`], undefined);
  assert.ok(data.session[`${PRIVATE_WINDOW_PREFIX}2`]);
});

test("migration removes recognizable legacy private copies while preserving regular history", async (t) => {
  const privateTree = tree(2, true);
  const legacy = structuredClone(privateTree);
  delete legacy.incognito;
  for (const node of Object.values(legacy.nodes)) delete node.incognito;
  const regular = tree(1);
  const entry = (value) => ({ id: `archive-${value.windowId}`, savedAt: Date.now(), tree: value });
  const data = mockStorage(t, {
    local: {
      [`${LOCAL_WINDOW_PREFIX}1`]: regular, [`${LOCAL_WINDOW_PREFIX}2`]: legacy,
      [LOCAL_SNAPSHOT_KEY]: { v: 1, windows: [regular, legacy] },
      [LOCAL_RESTORE_ARCHIVE_KEY]: { v: 1, entries: [entry(regular), entry(legacy)] }
    },
    sync: { [SYNC_SNAPSHOT_KEY]: { v: 1, windows: [{ w: "1", n: [] }, { w: "2", n: [{ u: "private-marker" }] }] } }
  });
  await migrateLocalStorage({ 1: regular, 2: privateTree });
  assert.equal(JSON.stringify(data.local).includes("private-marker"), false);
  assert.equal(JSON.stringify(data.sync).includes("private-marker"), false);
  assert.ok(data.local[`${LOCAL_WINDOW_PREFIX}1`]);
  assert.ok(data.session[`${PRIVATE_WINDOW_PREFIX}2`]);
});

test("private session failures never fall back to disk or sync", async (t) => {
  const data = mockStorage(t);
  chrome.storage.session.set = async () => { throw new Error("session quota"); };
  await assert.rejects(saveWindowTree(tree(2, true)), /session quota/);
  assert.deepEqual(data.local, {});
  assert.deepEqual(data.sync, {});
});

test("a full private session does not block regular-window saves or migration", async (t) => {
  const data = mockStorage(t);
  chrome.storage.session.set = async () => { throw new Error("session quota"); };
  const windows = { 1: tree(1), 2: tree(2, true) };
  await assert.rejects(saveWindowTrees(windows), /session quota/);
  assert.ok(data.local[`${LOCAL_WINDOW_PREFIX}1`]);
  assert.equal(JSON.stringify(data.local).includes("private-marker"), false);
  windows[1].nodes["tab:11"].lastKnownTitle = "Saved during migration";
  await assert.rejects(migrateLocalStorage(windows), /session quota/);
  assert.equal(data.local[`${LOCAL_WINDOW_PREFIX}1`].nodes["tab:11"].lastKnownTitle, "Saved during migration");
});

test("session removal is serialized behind pending writes and preserves unrelated session keys", async (t) => {
  const data = mockStorage(t, { session: { unrelated: "keep" } });
  await Promise.all([savePrivateWindowTrees([tree(2, true)]), removePrivateWindowTree(2)]);
  assert.deepEqual(data.session, { unrelated: "keep" });
  await savePrivateWindowTrees([tree(2, true), tree(3, true)]);
  await prunePrivateWindowTrees([3]);
  assert.equal(data.session[`${PRIVATE_WINDOW_PREFIX}2`], undefined);
  assert.ok(data.session[`${PRIVATE_WINDOW_PREFIX}3`]);
  await removeWindowTree(3);
  assert.deepEqual(data.session, { unrelated: "keep" });
});

test("clearing the browser session leaves no private tree to restore", async (t) => {
  const data = mockStorage(t);
  await saveWindowTrees({ 1: tree(1), 2: tree(2, true) });
  for (const key of Object.keys(data.session)) delete data.session[key];
  assert.deepEqual(await loadPrivateWindowTrees(), []);
  assert.deepEqual((await loadAllWindowTrees()).map((value) => value.windowId), [1]);
});
