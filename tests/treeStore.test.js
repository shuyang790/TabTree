import test from "node:test";
import assert from "node:assert/strict";

import { LOCAL_RESTORE_ARCHIVE_KEY } from "../shared/constants.js";
import { createEmptyWindowTree, nodeIdFromTabId } from "../shared/treeModel.js";
import { loadRestoreArchive, saveRestoreArchive } from "../shared/treeStore.js";

function createChromeStorageMock() {
  const localData = {};
  const syncData = {};

  const makeArea = (backing) => ({
    async get(keys) {
      if (keys == null) {
        return { ...backing };
      }
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, backing[key]]));
      }
      if (typeof keys === "string") {
        return { [keys]: backing[keys] };
      }
      return Object.fromEntries(
        Object.entries(keys).map(([key, defaultValue]) => [key, key in backing ? backing[key] : defaultValue])
      );
    },
    async set(values) {
      Object.assign(backing, values);
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete backing[key];
      }
    }
  });

  return {
    backing: { localData, syncData },
    chrome: {
      storage: {
        local: makeArea(localData),
        sync: makeArea(syncData)
      }
    }
  };
}

function makeTree(windowId, { child = false, titlePrefix = "Tab" } = {}) {
  const tree = createEmptyWindowTree(windowId);
  tree.nodes[nodeIdFromTabId(1)] = {
    nodeId: nodeIdFromTabId(1),
    tabId: 1,
    parentNodeId: null,
    childNodeIds: child ? [nodeIdFromTabId(2)] : [],
    collapsed: false,
    pinned: false,
    groupId: null,
    index: 0,
    windowId,
    active: true,
    lastKnownTitle: `${titlePrefix} Root`,
    lastKnownUrl: `https://example.com/${titlePrefix.toLowerCase()}-root`,
    favIconUrl: "",
    createdAt: 1,
    updatedAt: 10
  };

  if (child) {
    tree.nodes[nodeIdFromTabId(2)] = {
      nodeId: nodeIdFromTabId(2),
      tabId: 2,
      parentNodeId: nodeIdFromTabId(1),
      childNodeIds: [],
      collapsed: false,
      pinned: false,
      groupId: null,
      index: 1,
      windowId,
      active: false,
      lastKnownTitle: `${titlePrefix} Child`,
      lastKnownUrl: `https://example.com/${titlePrefix.toLowerCase()}-child`,
      favIconUrl: "",
      createdAt: 2,
      updatedAt: 10
    };
  }

  tree.rootNodeIds = [nodeIdFromTabId(1)];
  tree.selectedTabId = 1;
  tree.updatedAt = 10;
  return tree;
}

test("saveRestoreArchive keeps prior archive lineage when a window gets a new archive id", async () => {
  const mock = createChromeStorageMock();
  globalThis.chrome = mock.chrome;

  const firstArchive = await saveRestoreArchive(
    { 1: makeTree(1, { child: true, titlePrefix: "Historic" }) },
    { 1: "historic-id" }
  );
  const secondArchive = await saveRestoreArchive(
    { 1: makeTree(1, { child: false, titlePrefix: "Current" }) },
    { 1: "current-id" },
    firstArchive
  );

  const loaded = await loadRestoreArchive();
  const entryIds = loaded.entries.map((entry) => entry.id).sort();

  assert.deepEqual(entryIds, ["current-id", "historic-id"]);
  assert.equal(secondArchive.entries.length, 2);
  assert.equal(loaded.entries.find((entry) => entry.id === "historic-id")?.tree.nodes[nodeIdFromTabId(2)]?.parentNodeId, nodeIdFromTabId(1));
  assert.equal(loaded.entries.find((entry) => entry.id === "current-id")?.tree.nodes[nodeIdFromTabId(2)], undefined);
});

test("saveRestoreArchive reuses the same entry when archive id is stable", async () => {
  const mock = createChromeStorageMock();
  globalThis.chrome = mock.chrome;

  await saveRestoreArchive(
    { 2: makeTree(2, { child: true, titlePrefix: "Before" }) },
    { 2: "stable-id" }
  );
  const updated = await saveRestoreArchive(
    { 2: makeTree(2, { child: false, titlePrefix: "After" }) },
    { 2: "stable-id" }
  );

  const loaded = await loadRestoreArchive();

  assert.equal(updated.entries.length, 1);
  assert.equal(loaded.entries.length, 1);
  assert.equal(loaded.entries[0].id, "stable-id");
  assert.equal(loaded.entries[0].tree.restoreArchiveId, "stable-id");
  assert.equal(loaded.entries[0].tree.nodes[nodeIdFromTabId(2)], undefined);
  assert.ok(mock.backing.localData[LOCAL_RESTORE_ARCHIVE_KEY]);
});
