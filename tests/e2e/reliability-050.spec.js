import { expect, test } from "./extension.fixture.js";

test("a rejected close keeps the tab visible, reports the failure, and allows a successful retry", async ({ context, sidePanelPage }) => {
  const target = await context.newPage();
  await target.goto("data:text/html,<title>Close failure retry target</title>");
  const row = sidePanelPage.locator(".tree-row").filter({
    has: sidePanelPage.locator(".title", { hasText: "Close failure retry target" })
  });
  await expect(row).toBeVisible();
  await row.click();
  const tabId = Number(await row.getAttribute("data-tab-id"));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const pageErrors = [];
  sidePanelPage.on("pageerror", (error) => pageErrors.push(error.message));

  await worker.evaluate((blockedTabId) => {
    globalThis.__testOriginalTabsRemove = chrome.tabs.remove;
    chrome.tabs.remove = async (ids) => {
      if ((Array.isArray(ids) ? ids : [ids]).includes(blockedTabId)) {
        throw new Error("Test rejection while closing a live tab");
      }
      return globalThis.__testOriginalTabsRemove(ids);
    };
  }, tabId);

  try {
    await row.locator('[data-action="close-tab"]').click();
    const errorStatus = sidePanelPage.locator("#close-error");
    const expectedMessage = await sidePanelPage.evaluate(() => chrome.i18n.getMessage("closeTabsFailed"));
    await expect(errorStatus).toBeVisible();
    await expect(errorStatus).toHaveText(expectedMessage);
    await expect(errorStatus).toHaveAttribute("role", "status");
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("aria-selected", "true");
    expect(await sidePanelPage.evaluate(async (id) => {
      const tab = await chrome.tabs.get(id);
      const response = await chrome.runtime.sendMessage({ type: "GET_STATE", payload: { windowId: tab.windowId } });
      return !!response.payload.windows[tab.windowId]?.nodes?.[`tab:${id}`];
    }, tabId)).toBe(true);

    await worker.evaluate(() => {
      chrome.tabs.remove = globalThis.__testOriginalTabsRemove;
      delete globalThis.__testOriginalTabsRemove;
    });
    await row.locator('[data-action="close-tab"]').click();
    await expect(row).toHaveCount(0);
    await expect(errorStatus).toBeHidden();
    expect(pageErrors).toEqual([]);
  } finally {
    await worker.evaluate(() => {
      if (globalThis.__testOriginalTabsRemove) {
        chrome.tabs.remove = globalThis.__testOriginalTabsRemove;
        delete globalThis.__testOriginalTabsRemove;
      }
    }).catch(() => {});
  }
});

test("remote settings update the worker and panel, and survive an unrelated local edit", async ({ sidePanelPage }) => {
  await expect(sidePanelPage.locator(".tree-row").first()).toBeVisible();
  await sidePanelPage.locator("#open-settings").click();

  const original = await sidePanelPage.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    const settings = response.payload.settings;
    // A direct write generates the same storage.onChanged event as a remote
    // Chrome Sync update, without using a signed-in or real browser profile.
    await chrome.storage.sync.set({ "settings.v1": { ...settings, indentPx: 26 } });
    return settings;
  });

  await expect.poll(() => sidePanelPage.evaluate(async () => {
    return (await chrome.runtime.sendMessage({ type: "GET_STATE" })).payload.settings.indentPx;
  })).toBe(26);
  await expect(sidePanelPage.locator('input[name="indentPx"]')).toHaveValue("26");

  const nextShowCloseButton = !original.showCloseButton;
  await sidePanelPage.locator('input[name="showCloseButton"]').setChecked(nextShowCloseButton);
  await expect.poll(() => sidePanelPage.evaluate(async () => {
    const settings = (await chrome.storage.sync.get("settings.v1"))["settings.v1"];
    return { indentPx: settings.indentPx, showCloseButton: settings.showCloseButton };
  })).toEqual({ indentPx: 26, showCloseButton: nextShowCloseButton });

  // Also cover a local patch sent immediately after the external write, before
  // the panel has rendered the new settings notification.
  const immediateResult = await sidePanelPage.evaluate(async () => {
    const settings = (await chrome.storage.sync.get("settings.v1"))["settings.v1"];
    await chrome.storage.sync.set({ "settings.v1": { ...settings, indentPx: 27 } });
    const response = await chrome.runtime.sendMessage({
      type: "PATCH_SETTINGS",
      payload: { settingsPatch: { shortcutHintsEnabled: !settings.shortcutHintsEnabled } }
    });
    const stored = (await chrome.storage.sync.get("settings.v1"))["settings.v1"];
    return {
      ok: response.ok,
      indentPx: stored.indentPx,
      shortcutHintsEnabled: stored.shortcutHintsEnabled,
      expectedShortcutHintsEnabled: !settings.shortcutHintsEnabled
    };
  });
  expect(immediateResult.ok).toBe(true);
  expect(immediateResult.indentPx).toBe(27);
  expect(immediateResult.shortcutHintsEnabled).toBe(immediateResult.expectedShortcutHintsEnabled);
  await expect(sidePanelPage.locator('input[name="indentPx"]')).toHaveValue("27");
});

test("large sync snapshots fit Chrome's native per-item quota and retain valid parent references", async ({ sidePanelPage }) => {
  await expect.poll(() => sidePanelPage.evaluate(async () => {
    return !!(await chrome.storage.sync.get("tree.sync.snapshot.v1"))["tree.sync.snapshot.v1"];
  })).toBe(true);

  const result = await sidePanelPage.evaluate(async () => {
    const { saveSyncSnapshot } = await import(chrome.runtime.getURL("shared/treeStore.js"));
    const key = "tree.sync.snapshot.v1";
    const windows = {};
    const rawSnapshot = { v: 1, t: Date.now(), windows: [] };
    for (let windowId = 9001; windowId <= 9003; windowId += 1) {
      const tree = {
        windowId,
        updatedAt: Date.now() - windowId,
        rootNodeIds: [],
        nodes: {}
      };
      const rootId = `tab:${windowId * 100}`;
      const rootUrl = `https://example.invalid/${windowId}/${"r".repeat(130)}`;
      const rawWindow = { w: String(windowId), n: [] };
      for (let index = 0; index < 80; index += 1) {
        const nodeId = `tab:${windowId * 100 + index}`;
        const url = index === 0
          ? rootUrl
          : index % 2 === 0
            ? `https://example.invalid/${windowId}/${index}/${"c".repeat(130)}`
            : `invalid URL 中文😀<\u2028\u2029/${windowId}/${index}/${"c".repeat(100)}`;
        tree.nodes[nodeId] = {
          nodeId,
          parentNodeId: index === 0 ? null : rootId,
          childNodeIds: [],
          lastKnownUrl: url,
          collapsed: index % 2 === 0
        };
        if (index === 0) tree.rootNodeIds.push(nodeId);
        else tree.nodes[rootId].childNodeIds.push(nodeId);
        rawWindow.n.push({ u: url, p: index === 0 ? "" : rootUrl, c: index % 2 === 0 ? 1 : 0 });
      }
      windows[windowId] = tree;
      rawSnapshot.windows.push(rawWindow);
    }

    const previous = (await chrome.storage.sync.get(key))[key];
    let rawRejected = false;
    try {
      await chrome.storage.sync.set({ [key]: rawSnapshot });
    } catch (error) {
      rawRejected = /quota/i.test(error.message);
    }
    const priorPreserved = JSON.stringify((await chrome.storage.sync.get(key))[key]) === JSON.stringify(previous);
    const snapshot = await saveSyncSnapshot(windows);
    const stored = (await chrome.storage.sync.get(key))[key];
    const bytes = await chrome.storage.sync.getBytesInUse(key);
    return {
      rawRejected,
      priorPreserved,
      bytes,
      quota: chrome.storage.sync.QUOTA_BYTES_PER_ITEM,
      snapshot,
      stored,
      nodeCount: snapshot.windows.reduce((count, window) => count + window.n.length, 0),
      parentReferencesValid: snapshot.windows.every((window) => {
        const urls = new Set(window.n.map((node) => node.u));
        return window.n.every((node) => !node.p || urls.has(node.p));
      })
    };
  });

  expect(result.rawRejected).toBe(true);
  expect(result.priorPreserved).toBe(true);
  expect(result.quota).toBe(8192);
  expect(result.bytes).toBeLessThanOrEqual(result.quota);
  expect(result.stored).toEqual(result.snapshot);
  expect(result.nodeCount).toBeGreaterThan(1);
  expect(result.nodeCount).toBeLessThan(240);
  expect(result.parentReferencesValid).toBe(true);
});
