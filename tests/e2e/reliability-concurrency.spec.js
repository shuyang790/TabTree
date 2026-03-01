import { expect, test } from "./extension.fixture.js";

async function createTitledTab(context, title) {
  const page = await context.newPage();
  await page.setContent(`<title>${title}</title><main>${title}</main>`);
  await expect.poll(() => page.title()).toBe(title);
  return page;
}

async function trackedConvergenceSummary(sidePanelPage, trackedTitles) {
  return sidePanelPage.evaluate(async (titles) => {
    const tracked = new Set(titles);
    const windowId = (await chrome.windows.getCurrent()).id;
    const [tabs, response] = await Promise.all([
      chrome.tabs.query({ windowId }),
      chrome.runtime.sendMessage({
        type: "GET_STATE",
        payload: { windowId }
      })
    ]);

    const windows = response?.payload?.windows || {};
    const tree = windows[windowId] || windows[String(windowId)] || null;
    const trackedNativeTabs = tabs
      .filter((tab) => tracked.has(tab.title || ""))
      .sort((a, b) => a.index - b.index);
    const trackedNativeIds = trackedNativeTabs.map((tab) => tab.id);
    const trackedNativeTitles = trackedNativeTabs.map((tab) => tab.title || "");
    const trackedTreeNodes = Object.values(tree?.nodes || {})
      .filter((node) => tracked.has(node.lastKnownTitle || ""));
    const trackedTreeIds = trackedTreeNodes.map((node) => node.tabId);
    const trackedTreeTitles = trackedTreeNodes
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((node) => node.lastKnownTitle || "");

    let invalidParentCount = 0;
    for (const node of trackedTreeNodes) {
      if (!node.parentNodeId) {
        continue;
      }
      if (node.parentNodeId === node.nodeId || !tree?.nodes?.[node.parentNodeId]) {
        invalidParentCount += 1;
      }
    }

    const nativeOnlyTabIds = trackedNativeIds.filter((id) => !trackedTreeIds.includes(id));
    const treeOnlyTabIds = trackedTreeIds.filter((id) => !trackedNativeIds.includes(id));
    const orderMatches = trackedNativeTitles.length === trackedTreeTitles.length
      && trackedNativeTitles.every((title, index) => title === trackedTreeTitles[index]);

    return {
      invalidParentCount,
      nativeOnlyTabIds,
      orderMatches,
      treeOnlyTabIds
    };
  }, trackedTitles);
}

test.describe("Reliability: concurrency", () => {
  test("concurrent tree actions and tab events converge to one consistent order", async ({ context, sidePanelPage }) => {
    const stamp = Date.now();
    const titles = [
      `Reliability A ${stamp}`,
      `Reliability B ${stamp}`,
      `Reliability C ${stamp}`,
      `Reliability D ${stamp}`,
      `Reliability E ${stamp}`
    ];
    const pages = [];

    try {
      for (const title of titles) {
        pages.push(await createTitledTab(context, title));
      }

      const ids = await sidePanelPage.evaluate(async (orderedTitles) => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        return orderedTitles.map((title) => tabs.find((tab) => tab.title === title)?.id ?? null);
      }, titles);

      expect(ids.every((id) => Number.isInteger(id))).toBe(true);
      const [a, b, c, d, e] = ids;

      await sidePanelPage.evaluate(async ({ a, b, c, d, e }) => {
        const burstOne = [
          chrome.runtime.sendMessage({
            type: "TREE_ACTION",
            payload: {
              type: "REPARENT_TAB",
              tabId: c,
              newParentTabId: a
            }
          }),
          chrome.runtime.sendMessage({
            type: "TREE_ACTION",
            payload: {
              type: "REPARENT_TAB",
              tabId: d,
              newParentTabId: a
            }
          }),
          chrome.runtime.sendMessage({
            type: "TREE_ACTION",
            payload: {
              type: "BATCH_MOVE_TO_ROOT",
              tabIds: [b],
              placement: "after",
              targetTabId: e
            }
          }),
          chrome.tabs.move(e, { index: 0 }),
          chrome.tabs.update(c, { active: true })
        ];
        await Promise.allSettled(burstOne);

        const burstTwo = [
          chrome.runtime.sendMessage({
            type: "TREE_ACTION",
            payload: {
              type: "MOVE_TO_ROOT",
              tabId: d,
              browserIndex: 1
            }
          }),
          chrome.runtime.sendMessage({
            type: "TREE_ACTION",
            payload: {
              type: "TOGGLE_COLLAPSE",
              tabId: a
            }
          }),
          chrome.tabs.move(b, { index: 2 })
        ];
        await Promise.allSettled(burstTwo);
      }, { a, b, c, d, e });

      await expect.poll(async () => {
        return trackedConvergenceSummary(sidePanelPage, titles);
      }, { timeout: 15000 }).toEqual({
        invalidParentCount: 0,
        nativeOnlyTabIds: [],
        orderMatches: true,
        treeOnlyTabIds: []
      });
    } finally {
      await Promise.all(pages.map((page) => page.close().catch(() => {})));
    }
  });
});
