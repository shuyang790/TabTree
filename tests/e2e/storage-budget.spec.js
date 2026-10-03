import { expect, test } from "./extension.fixture.js";

const MIB = 1024 * 1024;

async function extensionWorker(context) {
  return context.serviceWorkers()[0] || context.waitForEvent("serviceworker");
}

test("storage accounting covers Chromium's Unicode, escaping, and number serialization", async ({ sidePanelPage }) => {
  const result = await sidePanelPage.evaluate(async () => {
    const { storageBytes } = await import(chrome.runtime.getURL("shared/localStorageBudget.js"));
    const values = {
      "budget-test-中文😀<\u2028\u2029": {
        text: "标题😀 <script> \u2028\u2029\n\t\"\\",
        nested: ["é", "\u0000", { "键<": "内容" }],
        numbers: [0, -0, 0.000001, 1e-7, 1e21, 1234.5678, 1790985600000]
      }
    };
    const keys = Object.keys(values);
    try {
      await chrome.storage.local.set(values);
      return {
        estimate: storageBytes(values),
        actual: await chrome.storage.local.getBytesInUse(keys),
        manifestPermissions: chrome.runtime.getManifest().permissions,
        grantedPermissions: (await chrome.permissions.getAll()).permissions
      };
    } finally {
      await chrome.storage.local.remove(keys);
    }
  });

  expect(result.manifestPermissions).not.toContain("unlimitedStorage");
  expect(result.grantedPermissions).not.toContain("unlimitedStorage");
  expect(result.estimate).toBeGreaterThanOrEqual(result.actual);
  expect(result.estimate - result.actual).toBeLessThan(256);
});

test("Chrome rejects a write over 10 MiB without replacing committed data", async ({ sidePanelPage }) => {
  const result = await sidePanelPage.evaluate(async () => {
    const markerKey = "budget-test-committed";
    const oversizedKey = "budget-test-oversized";
    try {
      await chrome.storage.local.set({ [markerKey]: "previous committed value" });
      let rejected = false;
      let error = "";
      try {
        await chrome.storage.local.set({
          [markerKey]: "uncommitted replacement",
          [oversizedKey]: "x".repeat(10 * 1024 * 1024)
        });
      } catch (failure) {
        rejected = true;
        error = failure.message;
      }
      return {
        rejected,
        error,
        stored: await chrome.storage.local.get([markerKey, oversizedKey]),
        totalBytes: await chrome.storage.local.getBytesInUse(null),
        quota: chrome.storage.local.QUOTA_BYTES
      };
    } finally {
      await chrome.storage.local.remove([markerKey, oversizedKey]);
    }
  });

  expect(result.quota).toBe(10 * MIB);
  expect(result.rejected).toBe(true);
  expect(result.error).toMatch(/quota/i);
  expect(result.stored).toEqual({ "budget-test-committed": "previous committed value" });
  expect(result.totalBytes).toBeLessThanOrEqual(result.quota);
});

test("startup trims a legacy store above 8 MiB and retains the exact tree relationship", async ({ context, sidePanelPage, extensionId }) => {
  const ids = await sidePanelPage.evaluate(async () => {
    const windowId = (await chrome.windows.getCurrent()).id;
    const parent = await chrome.tabs.create({ windowId, url: "data:text/html,<title>Budget Parent</title>" });
    const child = await chrome.tabs.create({ windowId, url: "data:text/html,<title>Budget Child</title>" });
    const response = await chrome.runtime.sendMessage({
      type: "TREE_ACTION",
      payload: { type: "REPARENT_TAB", tabId: child.id, newParentTabId: parent.id }
    });
    if (!response?.ok) throw new Error("Unable to create the test tree relationship");
    return { windowId, parentId: parent.id, childId: child.id };
  });

  // Wait for the production persistence coordinator to finish its initial saves.
  await expect.poll(() => sidePanelPage.evaluate(async ({ windowId, parentId, childId }) => {
    const local = await chrome.storage.local.get(null);
    const tree = local[`tree.local.v1.${windowId}`];
    return tree?.nodes?.[`tab:${childId}`]?.parentNodeId === `tab:${parentId}`;
  }, ids)).toBe(true);

  // No test-side treeStore writer: migration runs through the real worker's
  // startup path, sharing its production local-write queue. Stop it before
  // seeding legacy data so a pending production save cannot replace the seed.
  const cdp = await context.newCDPSession(sidePanelPage);
  const { targetInfos } = await cdp.send("Target.getTargets");
  const workerTarget = targetInfos.find((target) => target.type === "service_worker"
    && target.url.startsWith(`chrome-extension://${extensionId}/`));
  expect(workerTarget).toBeTruthy();
  await cdp.send("Target.closeTarget", { targetId: workerTarget.targetId });
  const legacyBytes = await sidePanelPage.evaluate(async ({ windowId, parentId }) => {
    const key = `tree.local.v1.${windowId}`;
    const raw = await chrome.storage.local.get([key]);
    const tree = raw[key];
    tree.nodes[`tab:${parentId}`].favIconUrl = `data:image/png;base64,${"A".repeat(512 * 1024)}`;
    const now = Date.now();
    const backup = (id, age) => ({
      id,
      windowId: 900001 + age,
      savedAt: now - age,
      tree: {
        windowId: 900001 + age,
        version: 1,
        updatedAt: now - age,
        rootNodeIds: ["tab:900001"],
        groups: {},
        nodes: {
          "tab:900001": {
            nodeId: "tab:900001",
            tabId: 900001,
            windowId: 900001 + age,
            parentNodeId: null,
            childNodeIds: [],
            lastKnownUrl: `https://example.invalid/${id}`,
            lastKnownTitle: "R".repeat(4.25 * 1024 * 1024)
          }
        }
      }
    });
    await chrome.storage.local.set({
      [key]: tree,
      "tree.local.snapshot.v1": { v: 1, t: now, windows: [tree] },
      "tree.local.restore.archive.v1": {
        v: 1,
        t: now,
        entries: [backup("budget-newer", 1), backup("budget-older", 1000)]
      }
    });
    const bytes = await chrome.storage.local.getBytesInUse(null);
    return bytes;
  }, ids);

  expect(legacyBytes).toBeGreaterThan(8 * MIB);
  expect(legacyBytes).toBeLessThan(10 * MIB);
  await cdp.detach();

  await expect.poll(() => sidePanelPage.evaluate(async ({ windowId, parentId, childId }) => {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE", payload: { windowId } });
    const live = response?.payload?.windows?.[windowId];
    const stored = await chrome.storage.local.get(null);
    const tree = stored[`tree.local.v1.${windowId}`];
    const archiveIds = stored["tree.local.restore.archive.v1"]?.entries?.map((entry) => entry.id) || [];
    return {
      withinBudget: (await chrome.storage.local.getBytesInUse(null)) <= 8 * 1024 * 1024,
      liveParent: live?.nodes?.[`tab:${childId}`]?.parentNodeId,
      storedParent: tree?.nodes?.[`tab:${childId}`]?.parentNodeId,
      parentChildren: tree?.nodes?.[`tab:${parentId}`]?.childNodeIds,
      retainedNewer: archiveIds.includes("budget-newer"),
      droppedOlder: !archiveIds.includes("budget-older"),
      droppedFavicon: tree?.nodes?.[`tab:${parentId}`]?.favIconUrl === undefined,
      error: response?.payload?.persistenceError || null
    };
  }, ids), { timeout: 15000 }).toEqual({
    withinBudget: true,
    liveParent: `tab:${ids.parentId}`,
    storedParent: `tab:${ids.parentId}`,
    parentChildren: [`tab:${ids.childId}`],
    retainedNewer: true,
    droppedOlder: true,
    droppedFavicon: true,
    error: null
  });
});

test("persistence warning appears and clears even when a tree update is scoped to another window", async ({ context, sidePanelPage }) => {
  await expect(sidePanelPage.locator(".tree-row").first()).toBeVisible();
  const worker = await extensionWorker(context);
  const warning = sidePanelPage.locator("#persistence-warning");
  const sendStatus = (persistenceError) => worker.evaluate(async (error) => {
    await chrome.runtime.sendMessage({
      type: "STATE_UPDATED",
      payload: { partial: true, changedWindowId: -999, persistenceError: error }
    }).catch(() => {});
  }, persistenceError);

  await expect(warning).toBeHidden();
  await sendStatus({ code: "LOCAL_STORAGE_CAPACITY" });
  await expect(warning).toBeVisible();
  await expect(warning).toHaveAttribute("role", "status");
  const capacityText = await sidePanelPage.evaluate(() => chrome.i18n.getMessage("localStorageCapacityWarning"));
  await expect(warning).toHaveText(capacityText);

  await sendStatus({ code: "LOCAL_STORAGE_WRITE_FAILED" });
  const failureText = await sidePanelPage.evaluate(() => chrome.i18n.getMessage("localStorageWriteWarning"));
  await expect(warning).toHaveText(failureText);

  await sendStatus(null);
  await expect(warning).toBeHidden();
  await expect(warning).toHaveText("");
});
