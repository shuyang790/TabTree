import { expect, test } from "./extension.fixture.js";

test("native storage adapters keep marked private trees only in session storage", async ({ sidePanelPage }) => {
  await expect(sidePanelPage.locator(".tree-row").first()).toBeVisible();
  const result = await sidePanelPage.evaluate(async () => {
    const store = await import(chrome.runtime.getURL("shared/treeStore.js"));
    const { buildTreeFromTabs, moveNode } = await import(chrome.runtime.getURL("shared/treeModel.js"));
    const { PRIVATE_WINDOW_PREFIX, removePrivateWindowTree } = await import(chrome.runtime.getURL("shared/privateSessionStore.js"));
    const marker = "private-native-storage-regression";
    const privateWindowId = 900001;
    const regularWindowId = 900002;
    const makeTree = (windowId, incognito) => {
      const tabs = [1, 2].map((offset) => ({
        id: windowId * 10 + offset,
        windowId,
        index: offset - 1,
        active: offset === 1,
        pinned: false,
        groupId: -1,
        incognito,
        title: `${incognito ? marker : "regular-native-storage"} ${offset}`,
        url: `https://${incognito ? marker : "regular-native-storage"}.invalid/${offset}`
      }));
      return moveNode(buildTreeFromTabs(tabs), `tab:${tabs[1].id}`, `tab:${tabs[0].id}`);
    };
    // This tests native storage APIs with explicitly marked synthetic trees.
    // Real incognito-event classification is separately covered by worker tests.
    const privateTree = makeTree(privateWindowId, true);
    const regularTree = makeTree(regularWindowId, false);
    const windows = { [privateWindowId]: privateTree, [regularWindowId]: regularTree };
    await store.saveWindowTrees(windows);
    await store.saveLocalSnapshot(windows);
    await store.saveRestoreArchive(windows);
    await store.saveSyncSnapshot(windows);

    const local = await chrome.storage.local.get(null);
    const sync = await chrome.storage.sync.get(null);
    const session = await chrome.storage.session.get(null);
    const restored = await store.loadWindowTree(privateWindowId);
    const privateChild = restored.nodes[`tab:${privateWindowId * 10 + 2}`];
    await removePrivateWindowTree(privateWindowId);
    const sessionAfterRemoval = await chrome.storage.session.get(null);

    return {
      privateInLocal: JSON.stringify(local).includes(marker),
      privateInSync: JSON.stringify(sync).includes(marker),
      privateInSession: JSON.stringify(session).includes(marker),
      sessionTreeIsPrivate: session[`${PRIVATE_WINDOW_PREFIX}${privateWindowId}`]?.incognito,
      restoredParent: privateChild.parentNodeId,
      expectedParent: `tab:${privateWindowId * 10 + 1}`,
      regularPersisted: !!local[`tree.local.v1.${regularWindowId}`],
      privateAfterRemoval: JSON.stringify(sessionAfterRemoval).includes(marker)
    };
  });

  expect(result.privateInLocal).toBe(false);
  expect(result.privateInSync).toBe(false);
  expect(result.privateInSession).toBe(true);
  expect(result.sessionTreeIsPrivate).toBe(true);
  expect(result.restoredParent).toBe(result.expectedParent);
  expect(result.regularPersisted).toBe(true);
  expect(result.privateAfterRemoval).toBe(false);
});

test("native session quota failure never falls back to disk or blocks regular trees", async ({ sidePanelPage }) => {
  await expect(sidePanelPage.locator(".tree-row").first()).toBeVisible();
  const result = await sidePanelPage.evaluate(async () => {
    const { saveWindowTrees } = await import(chrome.runtime.getURL("shared/treeStore.js"));
    const marker = "oversized-private-native-regression";
    const makeTree = (windowId, incognito, url) => ({
      windowId, incognito, updatedAt: Date.now(), rootNodeIds: ["tab:1"],
      nodes: {
        "tab:1": {
          nodeId: "tab:1", tabId: 1, windowId, incognito,
          parentNodeId: null, childNodeIds: [], lastKnownTitle: "Storage test", lastKnownUrl: url
        }
      }
    });
    const privateTree = makeTree(900003, true, marker + "x".repeat(chrome.storage.session.QUOTA_BYTES + 1));
    const regularTree = makeTree(900004, false, "https://regular-quota-regression.invalid/");
    let rejectedByQuota = false;
    try {
      await saveWindowTrees({ 900003: privateTree, 900004: regularTree });
    } catch (error) {
      rejectedByQuota = /quota/i.test(error.message);
    }
    const local = await chrome.storage.local.get(null);
    const sync = await chrome.storage.sync.get(null);
    const session = await chrome.storage.session.get(null);
    return {
      rejectedByQuota,
      regularPersisted: !!local["tree.local.v1.900004"],
      privateInLocal: JSON.stringify(local).includes(marker),
      privateInSync: JSON.stringify(sync).includes(marker),
      privateInSession: JSON.stringify(session).includes(marker)
    };
  });
  expect(result).toEqual({
    rejectedByQuota: true,
    regularPersisted: true,
    privateInLocal: false,
    privateInSync: false,
    privateInSession: false
  });
});
