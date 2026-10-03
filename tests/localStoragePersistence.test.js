import test from "node:test";
import assert from "node:assert/strict";

import {
  LOCAL_RESTORE_ARCHIVE_KEY,
  LOCAL_SNAPSHOT_KEY,
  LOCAL_WINDOW_PREFIX
} from "../shared/constants.js";
import { createEmptyWindowTree, nodeIdFromTabId } from "../shared/treeModel.js";
import {
  loadLocalSnapshot,
  loadRestoreArchive,
  loadWindowTree,
  migrateLocalStorage,
  removeWindowTree,
  saveLocalSnapshot,
  saveRestoreArchive,
  saveWindowTree
} from "../shared/treeStore.js";

const MIB = 1024 * 1024;
const APPLICATION_BUDGET = 8 * MIB;
const CHROME_QUOTA = 10 * MIB;

// Match the quota's key + serialized-value accounting independently of the
// production planner, so undercounting Unicode or replacement writes fails here.
// Chromium's base::WriteJson also emits these characters as six-byte escapes.
function chromeJson(value) {
  return JSON.stringify(value).replace(/[<\u2028\u2029]/g, (character) => ({
    "<": "\\u003C",
    "\u2028": "\\u2028",
    "\u2029": "\\u2029"
  })[character]);
}

function storageBytes(data) {
  return Object.entries(data).reduce(
    (total, [key, value]) => total + Buffer.byteLength(key, "utf8") + Buffer.byteLength(chromeJson(value), "utf8"),
    0
  );
}

function createQuotaStorageMock(initial = {}) {
  const data = structuredClone(initial);
  const calls = [];
  let nextSetError = null;

  const local = {
    QUOTA_BYTES: CHROME_QUOTA,
    async get(keys) {
      // An async boundary makes read/plan/write races visible under Promise.all.
      await Promise.resolve();
      const selected = keys == null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
      return structuredClone(Object.fromEntries(selected.filter((key) => key in data).map((key) => [key, data[key]])));
    },
    async getBytesInUse(keys) {
      return storageBytes(await local.get(keys));
    },
    async set(values) {
      calls.push({ method: "set", keys: Object.keys(values) });
      await Promise.resolve();
      if (nextSetError) {
        const error = nextSetError;
        nextSetError = null;
        throw error;
      }
      const next = { ...data, ...structuredClone(values) };
      const bytes = storageBytes(next);
      if (bytes > CHROME_QUOTA) {
        throw new Error(`QUOTA_BYTES quota exceeded: ${bytes}`);
      }
      Object.assign(data, next);
      calls.at(-1).committedBytes = bytes;
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      calls.push({ method: "remove", keys: list });
      for (const key of list) {
        delete data[key];
      }
    }
  };

  return {
    data,
    calls,
    chrome: { storage: { local } },
    failNextSet(error = new Error("Simulated storage write failure")) {
      nextSetError = error;
    }
  };
}

function makeTree(windowId, { titleBytes = 0, faviconBytes = 0, title = null } = {}) {
  const tree = createEmptyWindowTree(windowId);
  const rootId = nodeIdFromTabId(windowId * 10);
  const childId = nodeIdFromTabId(windowId * 10 + 1);
  tree.nodes[rootId] = {
    nodeId: rootId,
    tabId: windowId * 10,
    parentNodeId: null,
    childNodeIds: [childId],
    collapsed: true,
    pinned: false,
    groupId: null,
    index: 0,
    windowId,
    active: true,
    lastKnownTitle: title ?? (titleBytes ? "t".repeat(titleBytes) : `Window ${windowId}`),
    lastKnownUrl: `https://example.com/${windowId}?exact=%E4%B8%AD#restore`,
    favIconUrl: faviconBytes ? `data:image/png;base64,${"a".repeat(faviconBytes)}` : "https://example.com/favicon.ico",
    createdAt: 1,
    updatedAt: Date.now()
  };
  tree.nodes[childId] = {
    ...tree.nodes[rootId],
    nodeId: childId,
    tabId: windowId * 10 + 1,
    parentNodeId: rootId,
    childNodeIds: [],
    collapsed: false,
    index: 1,
    active: false,
    lastKnownTitle: "中文 child 🌳",
    lastKnownUrl: "https://example.com/child?repeated=a&repeated=b#fragment",
    favIconUrl: "https://example.com/favicon.ico"
  };
  tree.rootNodeIds = [rootId];
  tree.selectedTabId = windowId * 10;
  tree.updatedAt = Date.now();
  return tree;
}

function assertRestorableTree(actual, expected) {
  assert.deepEqual(actual.rootNodeIds, expected.rootNodeIds);
  assert.equal(actual.selectedTabId, expected.selectedTabId);
  assert.deepEqual(Object.keys(actual.nodes).sort(), Object.keys(expected.nodes).sort());
  for (const [id, expectedNode] of Object.entries(expected.nodes)) {
    assert.deepEqual(actual.nodes[id].childNodeIds, expectedNode.childNodeIds);
    assert.equal(actual.nodes[id].parentNodeId, expectedNode.parentNodeId);
    assert.equal(actual.nodes[id].collapsed, expectedNode.collapsed);
    assert.equal(actual.nodes[id].lastKnownTitle, expectedNode.lastKnownTitle);
    assert.equal(actual.nodes[id].lastKnownUrl, expectedNode.lastKnownUrl);
    assert.ok(!actual.nodes[id].favIconUrl, "persisted tree should omit favicon payloads");
  }
}

test("migration shrinks legacy storage above Chrome's quota in an atomic replacement", async () => {
  const tree = makeTree(1, { faviconBytes: 4 * MIB });
  const initial = {
    [`${LOCAL_WINDOW_PREFIX}1`]: tree,
    [LOCAL_SNAPSHOT_KEY]: { v: 1, t: Date.now(), windows: [tree] },
    [LOCAL_RESTORE_ARCHIVE_KEY]: {
      v: 1,
      t: Date.now(),
      entries: [{ id: "legacy", windowId: 1, savedAt: Date.now(), tree }]
    }
  };
  assert.ok(storageBytes(initial) > CHROME_QUOTA);
  const mock = createQuotaStorageMock(initial);
  globalThis.chrome = mock.chrome;

  await migrateLocalStorage({ 1: tree });

  assert.ok(storageBytes(mock.data) <= APPLICATION_BUDGET);
  assert.equal(mock.calls[0].method, "set", "legacy backups must survive until the replacement commits");
  assert.ok(mock.calls.filter((call) => call.method === "set").every((call) => call.committedBytes <= APPLICATION_BUDGET));
  assertRestorableTree(await loadWindowTree(1), tree);
  for (const snapshotTree of (await loadLocalSnapshot())?.windows || []) {
    assertRestorableTree(snapshotTree, tree);
  }
  for (const entry of (await loadRestoreArchive()).entries) {
    assertRestorableTree(entry.tree, tree);
  }
  assert.ok(tree.nodes[nodeIdFromTabId(10)].favIconUrl.length > 4 * MIB, "migration must not mutate live state");
});

test("concurrent window and backup writes preserve all active trees under the cap", async () => {
  const mock = createQuotaStorageMock();
  globalThis.chrome = mock.chrome;
  const trees = Object.fromEntries([1, 2, 3].map((id) => [id, makeTree(id, { titleBytes: 1.5 * MIB })]));

  await Promise.all([
    ...Object.values(trees).map((tree) => saveWindowTree(tree)),
    saveLocalSnapshot(trees),
    saveRestoreArchive(trees, { 1: "one", 2: "two", 3: "three" })
  ]);

  assert.ok(storageBytes(mock.data) <= APPLICATION_BUDGET);
  for (const tree of Object.values(trees)) {
    assertRestorableTree(await loadWindowTree(tree.windowId), tree);
  }
  assert.ok(mock.calls.filter((call) => call.method === "set").every((call) => call.committedBytes <= APPLICATION_BUDGET));
});

test("a failed capped write preserves committed trees and backups until a retry succeeds", async () => {
  const mock = createQuotaStorageMock();
  globalThis.chrome = mock.chrome;
  const original = makeTree(1, { titleBytes: MIB });
  await saveWindowTree(original);
  await saveLocalSnapshot({ 1: original });
  await saveRestoreArchive({ 2: makeTree(2, { titleBytes: 3 * MIB }) }, { 2: "historic" });
  const before = structuredClone(mock.data);
  const callCount = mock.calls.length;
  const updated = makeTree(1, { titleBytes: 7 * MIB });
  mock.failNextSet();

  await assert.rejects(saveWindowTree(updated), /Simulated storage write failure/);

  assert.deepEqual(mock.data, before);
  assert.deepEqual(mock.calls.slice(callCount).map((call) => call.method), ["set"]);

  await saveWindowTree(updated);

  assert.ok(storageBytes(mock.data) <= APPLICATION_BUDGET);
  assertRestorableTree(await loadWindowTree(1), updated);
});

test("an active tree over budget is rejected without damaging storage or blocking later saves", async () => {
  const mock = createQuotaStorageMock();
  globalThis.chrome = mock.chrome;
  const original = makeTree(1);
  await saveWindowTree(original);
  await saveLocalSnapshot({ 1: original });
  await saveRestoreArchive({ 1: original }, { 1: "backup" });
  const before = structuredClone(mock.data);
  const callCount = mock.calls.length;

  await assert.rejects(saveWindowTree(makeTree(1, { titleBytes: APPLICATION_BUDGET })));

  assert.deepEqual(mock.data, before);
  assert.equal(mock.calls.length, callCount, "infeasible writes must be rejected during planning");
  const later = makeTree(2);
  await saveWindowTree(later);
  assertRestorableTree(await loadWindowTree(1), original);
  assertRestorableTree(await loadWindowTree(2), later);
});

test("a queued removal runs after an earlier save without deleting other windows", async () => {
  const mock = createQuotaStorageMock();
  globalThis.chrome = mock.chrome;
  const retained = makeTree(2);

  await Promise.all([
    saveWindowTree(makeTree(1)),
    removeWindowTree(1),
    saveWindowTree(retained)
  ]);

  assert.equal(await loadWindowTree(1), null);
  assertRestorableTree(await loadWindowTree(2), retained);
});

test("a stale supplied archive cannot resurrect entries evicted to meet the cap", async () => {
  const mock = createQuotaStorageMock();
  globalThis.chrome = mock.chrome;
  const stale = await saveRestoreArchive(
    { 2: makeTree(2, { titleBytes: 3 * MIB }) },
    { 2: "evicted-history" }
  );
  assert.equal(stale.entries.length, 1);
  await saveWindowTree(makeTree(1, { titleBytes: 6 * MIB }));
  assert.equal((await loadRestoreArchive()).entries.length, 0);

  const saved = await saveRestoreArchive({}, {}, stale);

  assert.equal(saved.entries.length, 0);
  assert.deepEqual(saved, await loadRestoreArchive());
  assert.ok(storageBytes(mock.data) <= APPLICATION_BUDGET);
});

test("an omitted snapshot is reported as null and archive returns only retained entries", async () => {
  const mock = createQuotaStorageMock();
  globalThis.chrome = mock.chrome;
  const tree = makeTree(1, { titleBytes: 5 * MIB });
  await saveWindowTree(tree);

  const snapshot = await saveLocalSnapshot({ 1: tree });
  const archive = await saveRestoreArchive({ 1: tree }, { 1: "too-large-backup" });

  assert.equal(snapshot, null);
  assert.equal(await loadLocalSnapshot(), null);
  assert.deepEqual(archive, await loadRestoreArchive());
  assert.equal(archive.entries.length, 0);
  assertRestorableTree(await loadWindowTree(1), tree);
  assert.ok(storageBytes(mock.data) <= APPLICATION_BUDGET);
});

test("UTF-8 title bytes count toward the cap even when character count fits", async () => {
  const mock = createQuotaStorageMock();
  globalThis.chrome = mock.chrome;
  const title = "🌳".repeat(2_100_000);
  assert.ok(title.length < APPLICATION_BUDGET);
  assert.ok(Buffer.byteLength(title, "utf8") > APPLICATION_BUDGET);

  await assert.rejects(saveWindowTree(makeTree(1, { title })));

  assert.deepEqual(mock.data, {});
  assert.equal(mock.calls.length, 0);
});

for (const [label, character] of [["less-than signs", "<"], ["line separators", "\u2028"], ["paragraph separators", "\u2029"]]) {
  test(`Chrome's escaped ${label} are budgeted before attempting a quota-breaking write`, async () => {
    const mock = createQuotaStorageMock();
    globalThis.chrome = mock.chrome;
    const title = character.repeat(2 * MIB);
    assert.ok(Buffer.byteLength(JSON.stringify(title), "utf8") < APPLICATION_BUDGET);
    assert.ok(Buffer.byteLength(chromeJson(title), "utf8") > CHROME_QUOTA);

    await assert.rejects(saveWindowTree(makeTree(1, { title })), { code: "LOCAL_STORAGE_CAPACITY" });

    assert.deepEqual(mock.data, {});
    assert.equal(mock.calls.length, 0, "the planner must catch native JSON expansion before any write");
  });
}
