import test from "node:test";
import assert from "node:assert/strict";

import { groupLiveTabIdsByWindow } from "../background/liveTabGrouping.js";

function mapToObject(grouped) {
  const out = {};
  for (const [windowId, tabIds] of grouped.entries()) {
    out[windowId] = tabIds;
  }
  return out;
}

test("groupLiveTabIdsByWindow groups requested ids from query results", async () => {
  const grouped = await groupLiveTabIdsByWindow([1, 2, 3], {
    queryTabs: async () => [
      { id: 1, windowId: 10 },
      { id: 3, windowId: 20 },
      { id: 99, windowId: 20 }
    ],
    getTab: async () => null
  });

  assert.deepEqual(mapToObject(grouped), {
    10: [1],
    20: [3]
  });
});

test("groupLiveTabIdsByWindow falls back to getTab when query fails", async () => {
  const grouped = await groupLiveTabIdsByWindow([1, 2, 2, 3], {
    queryTabs: async () => {
      throw new Error("query failed");
    },
    getTab: async (tabId) => {
      if (tabId === 1) {
        return { id: 1, windowId: 10 };
      }
      if (tabId === 3) {
        return { id: 3, windowId: 10 };
      }
      return null;
    }
  });

  assert.deepEqual(mapToObject(grouped), {
    10: [1, 3]
  });
});

test("groupLiveTabIdsByWindow ignores invalid ids", async () => {
  const grouped = await groupLiveTabIdsByWindow([NaN, null, 5], {
    queryTabs: async () => [{ id: 5, windowId: 7 }],
    getTab: async () => null
  });

  assert.deepEqual(mapToObject(grouped), {
    7: [5]
  });
});
