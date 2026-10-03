import test from "node:test";
import assert from "node:assert/strict";

import {
  LOCAL_ARCHIVE_MAX_TREES,
  LOCAL_ARCHIVE_RETENTION_MS,
  LOCAL_RESTORE_ARCHIVE_KEY,
  LOCAL_SNAPSHOT_KEY,
  LOCAL_WINDOW_PREFIX
} from "../shared/constants.js";
import {
  LOCAL_STORAGE_BUDGET_BYTES,
  LocalStorageCapacityError,
  compactWindowTree,
  planLocalStorage,
  storageBytes
} from "../shared/localStorageBudget.js";

const now = 2_000_000_000_000;
const key = (id) => `${LOCAL_WINDOW_PREFIX}${id}`;

function makeTree(windowId, { count = 3, archivedAt = null, updatedAt = now, favicon = "icon" } = {}) {
  const nodes = {};
  for (let i = 0; i < count; i += 1) {
    nodes[`tab-${i}`] = {
      nodeId: `tab-${i}`,
      tabId: i,
      parentNodeId: i ? `tab-${i - 1}` : null,
      childNodeIds: i < count - 1 ? [`tab-${i + 1}`] : [],
      collapsed: i % 2 === 0,
      pinned: false,
      lastKnownTitle: `页面 ${i} 😀 ${"title".repeat(50)}`,
      lastKnownUrl: `https://example.com/路径/${i}?q=${"query".repeat(80)}`,
      favIconUrl: favicon,
      index: i
    };
  }
  return { windowId, nodes, rootNodeIds: ["tab-0"], archivedAt, updatedAt };
}

function archiveEntry(id, savedAt, tree = makeTree(id)) {
  return { id: String(id), windowId: tree.windowId, savedAt, tree };
}

test("storageBytes measures raw UTF-8 keys and JSON values including escape sequences", () => {
  const values = { "键😀": "你好😀\n\"", plain: { text: "é" }, n: null };
  const expected = Object.entries(values).reduce((sum, [name, value]) =>
    sum + Buffer.byteLength(name) + Buffer.byteLength(JSON.stringify(value)), 0);
  assert.equal(storageBytes(values), expected);
  assert.equal(storageBytes({}), 0);
  assert.equal(LOCAL_STORAGE_BUDGET_BYTES, 8 * 1024 * 1024);
});

test("storageBytes matches Chromium escaping for less-than and Unicode separators", () => {
  const values = { "<\u2028": { "<key\u2029": "<\u2028\u2029> / \\u003C" } };
  const nativeValue = '{"\\u003Ckey\\u2029":"\\u003C\\u2028\\u2029> / \\\\u003C"}';
  assert.equal(storageBytes(values), Buffer.byteLength("<\u2028") + Buffer.byteLength(nativeValue));
  assert.equal(storageBytes({ value: "<" }), 5 + 8);
  assert.equal(storageBytes({ value: "\u2028" }), 5 + 8);
  assert.equal(storageBytes({ value: "\u2029" }), 5 + 8);
  assert.equal(storageBytes({ value: "/>" }), 5 + 4);
});

test("storageBytes reserves native double formatting while retaining int32 accuracy", () => {
  for (const number of [2147483648, -2147483649, now, Number.MAX_SAFE_INTEGER, Number.MIN_VALUE, 1.2, -0]) {
    assert.equal(storageBytes({ value: number }), 5 + 32);
  }
  for (const number of [0, 1, -1, 2147483647, -2147483648]) {
    assert.equal(storageBytes({ value: number }), 5 + String(number).length);
  }
  assert.ok(storageBytes({ nested: [1.234567890123e12] })
    >= Buffer.byteLength("nested") + Buffer.byteLength("[1.234567890123e+12]"));
});

test("escape-heavy title and URL use Chromium bytes at the exact capacity boundary", () => {
  const tree = makeTree(1, { count: 1 });
  tree.nodes["tab-0"].lastKnownTitle = "<\u2028\u2029".repeat(100);
  tree.nodes["tab-0"].lastKnownUrl = "https://example.com/?q=<\u2028\u2029";
  const current = { [key(1)]: tree };
  const budget = storageBytes({ [key(1)]: compactWindowTree(tree) });
  assert.equal(planLocalStorage(current, {}, { now, maxBytes: budget }).bytes, budget);
  assert.throws(() => planLocalStorage(current, {}, { now, maxBytes: budget - 1 }), LocalStorageCapacityError);
  assert.equal(tree.nodes["tab-0"].lastKnownTitle, "<\u2028\u2029".repeat(100));
});

test("escape-heavy active data exceeding native quota is rejected before any commit", () => {
  for (const character of ["<", "\u2028", "\u2029"]) {
    const tree = makeTree(1, { count: 1 });
    tree.nodes["tab-0"].lastKnownTitle = character.repeat(2 * 1024 * 1024);
    assert.throws(() => planLocalStorage({ [key(1)]: tree }, {}, { now }), LocalStorageCapacityError);
  }
});

test("compaction strips only favicon fields without mutating titles, URLs, nodes or topology", () => {
  const tree = makeTree(1, { count: 100, favicon: `data:image/png;base64,${"a".repeat(2048)}` });
  tree.nodes["tab-0"].extraMetadata = { retained: true };
  const original = structuredClone(tree);
  const compact = compactWindowTree(tree);
  assert.deepEqual(tree, original);
  assert.equal(Object.keys(compact.nodes).length, 100);
  for (const [id, originalNode] of Object.entries(original.nodes)) {
    const { favIconUrl: _favicon, ...expected } = originalNode;
    assert.deepEqual(compact.nodes[id], expected);
  }
  assert.deepEqual(compact.rootNodeIds, original.rootNodeIds);
  assert.ok(storageBytes({ tree: compact }) < storageBytes({ tree }));
});

test("planner compacts canonical, snapshot and archive trees without mutating inputs", () => {
  const tree = makeTree(1);
  const current = {
    [key(1)]: tree,
    [LOCAL_SNAPSHOT_KEY]: { v: 1, windows: [tree] },
    [LOCAL_RESTORE_ARCHIVE_KEY]: { entries: [archiveEntry(1, now, tree)] },
    unrelated: { favicon: "untouched" }
  };
  const before = structuredClone(current);
  const plan = planLocalStorage(current, {}, { now });
  assert.deepEqual(current, before);
  assert.deepEqual(plan.values[key(1)], compactWindowTree(tree));
  assert.deepEqual(plan.values[LOCAL_SNAPSHOT_KEY].windows[0], compactWindowTree(tree));
  assert.deepEqual(plan.values[LOCAL_RESTORE_ARCHIVE_KEY].entries[0].tree, compactWindowTree(tree));
  assert.deepEqual(plan.values.unrelated, before.unrelated);
  assert.deepEqual(plan.removedKeys, []);
  assert.equal(plan.bytes, storageBytes(plan.values));
});

test("exact budget boundary passes and one byte less fails without dropping protected nodes", () => {
  const current = { [key(1)]: makeTree(1) };
  const expected = { [key(1)]: compactWindowTree(current[key(1)]) };
  const maxBytes = storageBytes(expected);
  assert.equal(planLocalStorage(current, {}, { maxBytes, now }).bytes, maxBytes);
  assert.throws(() => planLocalStorage(current, {}, { maxBytes: maxBytes - 1, now }), (error) => {
    assert.ok(error instanceof LocalStorageCapacityError);
    assert.equal(error.name, "LocalStorageCapacityError");
    assert.equal(error.code, "LOCAL_STORAGE_CAPACITY");
    assert.equal(error.bytes, maxBytes);
    assert.equal(error.budget, maxBytes - 1);
    return true;
  });
});

test("snapshot is discarded before oldest archive entries and canonical records", () => {
  const current = {
    [key(1)]: makeTree(1),
    [key(2)]: makeTree(2, { archivedAt: now - 20 }),
    [LOCAL_SNAPSHOT_KEY]: { windows: [makeTree(1)] },
    [LOCAL_RESTORE_ARCHIVE_KEY]: { v: 1, entries: [archiveEntry(10, now - 10), archiveEntry(11, now)] }
  };
  const compacted = planLocalStorage(current, {}, { now }).values;
  const withoutSnapshot = { ...compacted };
  delete withoutSnapshot[LOCAL_SNAPSHOT_KEY];
  const snapshotOnly = planLocalStorage(current, {}, { now, maxBytes: storageBytes(withoutSnapshot) });
  assert.deepEqual(snapshotOnly.removedKeys, [LOCAL_SNAPSHOT_KEY]);
  assert.equal(snapshotOnly.values[LOCAL_RESTORE_ARCHIVE_KEY].entries.length, 2);

  const withoutOldArchive = {
    ...withoutSnapshot,
    [LOCAL_RESTORE_ARCHIVE_KEY]: { v: 1, entries: [compacted[LOCAL_RESTORE_ARCHIVE_KEY].entries[0]] }
  };
  const archivePruned = planLocalStorage(current, {}, { now, maxBytes: storageBytes(withoutOldArchive) });
  assert.deepEqual(archivePruned.values[LOCAL_RESTORE_ARCHIVE_KEY].entries.map((entry) => entry.id), ["11"]);
  assert.ok(archivePruned.values[key(2)]);
  assert.equal(archivePruned.bytes, storageBytes(archivePruned.values));
});

test("inactive canonical windows are evicted oldest first after optional backups", () => {
  const current = {
    [key(1)]: makeTree(1),
    [key(2)]: makeTree(2, { updatedAt: now - 30 }),
    [key(3)]: makeTree(3, { archivedAt: now - 20, updatedAt: now - 20 }),
    [LOCAL_SNAPSHOT_KEY]: { windows: [makeTree(1)] },
    [LOCAL_RESTORE_ARCHIVE_KEY]: { entries: [archiveEntry(4, now)] }
  };
  const desired = { [key(1)]: compactWindowTree(current[key(1)]), [key(3)]: compactWindowTree(current[key(3)]) };
  const plan = planLocalStorage(current, {}, { now, activeWindowIds: [1], maxBytes: storageBytes(desired) });
  assert.deepEqual(plan.values, desired);
  assert.ok(plan.removedKeys.includes(key(2)));
  assert.ok(plan.removedKeys.includes(LOCAL_SNAPSHOT_KEY));
  assert.ok(plan.removedKeys.includes(LOCAL_RESTORE_ARCHIVE_KEY));
});

test("incoming unarchived canonical updates remain mandatory even outside the active ID list", () => {
  const current = { [key(1)]: makeTree(1) };
  const updates = { [key(2)]: makeTree(2, { count: 10 }) };
  const before = structuredClone({ current, updates });
  assert.throws(() => planLocalStorage(current, updates, { now, activeWindowIds: [1], maxBytes: 100 }), LocalStorageCapacityError);
  assert.deepEqual({ current, updates }, before);
});

test("explicit active IDs protect even archived records from pressure and age pruning", () => {
  const tree = makeTree(1, { archivedAt: now - LOCAL_ARCHIVE_RETENTION_MS - 1 });
  const current = { [key(1)]: tree };
  assert.ok(planLocalStorage(current, {}, { now, activeWindowIds: [1] }).values[key(1)]);
  assert.throws(() => planLocalStorage(current, {}, { now, activeWindowIds: [1], maxBytes: 1 }), LocalStorageCapacityError);
});

test("archive entries and archived window records obey age and count limits", () => {
  const entries = Array.from({ length: LOCAL_ARCHIVE_MAX_TREES + 2 }, (_,i) => archiveEntry(i, now - i));
  entries.push(archiveEntry(99, now - LOCAL_ARCHIVE_RETENTION_MS - 1));
  const current = { [LOCAL_RESTORE_ARCHIVE_KEY]: { entries } };
  for (let i = 0; i < LOCAL_ARCHIVE_MAX_TREES + 2; i += 1) {
    current[key(i)] = makeTree(i, { count: 1, archivedAt: now - i, updatedAt: now - i });
  }
  current[key(99)] = makeTree(99, { archivedAt: now - LOCAL_ARCHIVE_RETENTION_MS - 1 });
  const plan = planLocalStorage(current, {}, { now });
  assert.equal(plan.values[LOCAL_RESTORE_ARCHIVE_KEY].entries.length, LOCAL_ARCHIVE_MAX_TREES);
  assert.deepEqual(plan.values[LOCAL_RESTORE_ARCHIVE_KEY].entries.map((entry) => entry.id),
    Array.from({ length: LOCAL_ARCHIVE_MAX_TREES }, (_, i) => String(i)));
  assert.equal(Object.keys(plan.values).filter((name) => name.startsWith(LOCAL_WINDOW_PREFIX)).length, LOCAL_ARCHIVE_MAX_TREES);
  assert.equal(plan.values[key(99)], undefined);
  assert.equal(plan.values[key(51)], undefined);
});

test("unrelated storage is preserved and counted against mandatory content", () => {
  const current = { [key(1)]: makeTree(1), unrelated: "界".repeat(1000), [`${LOCAL_WINDOW_PREFIX}custom`]: { data: "keep" } };
  const compacted = { ...current, [key(1)]: compactWindowTree(current[key(1)]) };
  const bytes = storageBytes(compacted);
  const plan = planLocalStorage(current, {}, { now, maxBytes: bytes });
  assert.deepEqual(plan.values, compacted);
  assert.throws(() => planLocalStorage(current, {}, { now, maxBytes: bytes - 1 }), LocalStorageCapacityError);
});

test("a later plan removes managed deletion markers after interrupted cleanup", () => {
  const current = {
    [key(1)]: makeTree(1),
    [key(2)]: null,
    [LOCAL_SNAPSHOT_KEY]: null,
    [LOCAL_RESTORE_ARCHIVE_KEY]: null,
    unrelated: null,
    [`${LOCAL_WINDOW_PREFIX}custom`]: null
  };
  const plan = planLocalStorage(current, {}, { now });
  assert.deepEqual(plan.removedKeys, [key(2), LOCAL_SNAPSHOT_KEY, LOCAL_RESTORE_ARCHIVE_KEY]);
  assert.deepEqual(plan.values, {
    [key(1)]: compactWindowTree(current[key(1)]),
    unrelated: null,
    [`${LOCAL_WINDOW_PREFIX}custom`]: null
  });
  assert.equal(current[key(2)], null);
});

test("oversized active update preserves previous canonical and archive inputs for a failed commit", () => {
  const current = {
    [key(1)]: makeTree(1, { count: 1 }),
    [LOCAL_RESTORE_ARCHIVE_KEY]: { entries: [archiveEntry(2, now)] }
  };
  const updates = { [key(1)]: makeTree(1, { count: 100 }) };
  const original = structuredClone({ current, updates });
  assert.throws(() => planLocalStorage(current, updates, { now, maxBytes: 1000 }), LocalStorageCapacityError);
  assert.deepEqual({ current, updates }, original);
});

test("legacy data larger than Chrome quota can compact into the budget in one plan", () => {
  const tree = makeTree(1, { count: 5, favicon: `data:image/png;base64,${"a".repeat(1024 * 1024)}` });
  const current = {
    [key(1)]: tree,
    [LOCAL_SNAPSHOT_KEY]: { windows: [tree] },
    [LOCAL_RESTORE_ARCHIVE_KEY]: { entries: [archiveEntry(1, now, tree)] }
  };
  assert.ok(storageBytes(current) > 10 * 1024 * 1024);
  const plan = planLocalStorage(current, {}, { now });
  assert.ok(plan.bytes < LOCAL_STORAGE_BUDGET_BYTES);
  assert.equal(Object.keys(plan.values[key(1)].nodes).length, 5);
  assert.deepEqual(plan.removedKeys, []);
});
