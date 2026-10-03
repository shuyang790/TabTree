import test from "node:test";
import assert from "node:assert/strict";
import { SYNC_SNAPSHOT_KEY } from "../shared/constants.js";
import { storageBytes } from "../shared/localStorageBudget.js";
import { boundSyncSnapshot, SYNC_SNAPSHOT_BUDGET_BYTES } from "../shared/syncSnapshotBudget.js";
import { loadSyncSnapshot, saveSyncSnapshot } from "../shared/treeStore.js";

function nativeBytes(key, value) {
  const json = JSON.stringify(value).replace(/[<\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return Buffer.byteLength(key) + Buffer.byteLength(json);
}

function tree(windowId, count, { chain = false, suffix = "a".repeat(100) } = {}) {
  const nodes = {};
  for (let index = 0; index < count; index += 1) {
    const id = `tab:${windowId * 1000 + index}`;
    nodes[id] = {
      nodeId: id,
      parentNodeId: chain && index ? `tab:${windowId * 1000 + index - 1}` : null,
      childNodeIds: chain && index + 1 < count ? [`tab:${windowId * 1000 + index + 1}`] : [],
      lastKnownUrl: `https://example.com/article/${index}/${suffix}`,
      collapsed: index % 2 === 0
    };
  }
  return {
    windowId,
    updatedAt: windowId,
    nodes,
    rootNodeIds: chain ? [Object.keys(nodes)[0]] : Object.keys(nodes)
  };
}

function strictSyncStorage(t) {
  const previous = globalThis.chrome;
  const data = { "settings.v1": { indentPx: 31 } };
  let writes = 0;
  globalThis.chrome = { storage: { sync: {
    async set(values) {
      for (const [key, value] of Object.entries(values)) {
        if (nativeBytes(key, value) > 8192) throw new Error("QUOTA_BYTES_PER_ITEM");
      }
      Object.assign(data, structuredClone(values));
      writes += 1;
    },
    async get(keys) {
      return Object.fromEntries(keys.map((key) => [key, structuredClone(data[key])]));
    }
  } } };
  t.after(() => { globalThis.chrome = previous; });
  return { data, get writes() { return writes; } };
}

test("small v1 sync snapshots remain unchanged and inputs are not mutated", () => {
  const snapshot = { v: 1, t: 100, windows: [
    { w: "1", n: [{ u: "https://example.com/root", p: "", c: 1 }] },
    { w: "2", n: [] }
  ] };
  const original = structuredClone(snapshot);
  assert.deepEqual(boundSyncSnapshot(snapshot), original);
  assert.deepEqual(snapshot, original);
});

test("80 ordinary long URLs fit in one native sync item by retaining whole nodes", async (t) => {
  const mock = strictSyncStorage(t);
  const windows = { 1: tree(1, 80) };
  const original = structuredClone(windows);
  const saved = await saveSyncSnapshot(windows);
  assert.ok(saved.windows[0].n.length > 0);
  assert.ok(saved.windows[0].n.length < 80);
  assert.ok(storageBytes({ [SYNC_SNAPSHOT_KEY]: saved }) <= SYNC_SNAPSHOT_BUDGET_BYTES);
  assert.deepEqual(await loadSyncSnapshot(), saved);
  assert.deepEqual(windows, original);
  assert.deepEqual(mock.data["settings.v1"], { indentPx: 31 });
  assert.equal(mock.writes, 1);
});

test("sync budget includes UTF-8 and Chrome-specific escaping without splitting nodes", () => {
  const nodes = Array.from({ length: 80 }, (_, index) => ({
    u: `${index}:` + "界😀<\u2028\u2029\\\"".repeat(20), p: "", c: 1
  }));
  const snapshot = { v: 1, t: Date.now(), windows: [{ w: "1", n: nodes }] };
  const original = structuredClone(snapshot);
  const bounded = boundSyncSnapshot(snapshot);
  assert.ok(bounded.windows[0].n.length > 0 && bounded.windows[0].n.length < nodes.length);
  assert.ok(nativeBytes(SYNC_SNAPSHOT_KEY, bounded) <= 8192);
  assert.ok(storageBytes({ [SYNC_SNAPSHOT_KEY]: bounded }) <= 8192);
  assert.deepEqual(bounded.windows[0].n, nodes.slice(0, bounded.windows[0].n.length));
  const oneMore = structuredClone(bounded);
  oneMore.windows[0].n.push(nodes[oneMore.windows[0].n.length]);
  assert.ok(storageBytes({ [SYNC_SNAPSHOT_KEY]: oneMore }) > 8192);
  assert.deepEqual(snapshot, original);
});

test("large multi-window sync snapshots prioritize recent windows and retain ancestor prefixes", async (t) => {
  strictSyncStorage(t);
  const windows = Object.fromEntries([1, 2, 3].map((id) => [id, tree(id, 80, { chain: true })]));
  const original = structuredClone(windows);
  const saved = await saveSyncSnapshot(windows);
  assert.equal(saved.windows.length, 1);
  assert.equal(saved.windows[0].w, "3");
  const retained = new Set();
  for (const node of saved.windows[0].n) {
    if (node.p) assert.ok(retained.has(node.p));
    retained.add(node.u);
  }
  assert.ok(retained.size > 1 && retained.size < 80);
  assert.ok(nativeBytes(SYNC_SNAPSHOT_KEY, saved) <= 8192);
  assert.deepEqual(windows, original);
});

test("budget counts window envelopes and separators across partially retained windows", () => {
  const snapshot = { v: 1, t: 100, windows: [1, 2, 3].map((id) => ({
    w: String(id), n: Array.from({ length: 30 }, (_, index) => ({
      u: `${index}:` + "x".repeat(150), p: "", c: 0
    }))
  })) };
  const saved = boundSyncSnapshot(snapshot);
  assert.equal(saved.windows.length, 2);
  assert.equal(saved.windows[0].n.length, 30);
  assert.ok(saved.windows[1].n.length > 0 && saved.windows[1].n.length < 30);
  assert.ok(storageBytes({ [SYNC_SNAPSHOT_KEY]: saved }) <= 8192);
});
