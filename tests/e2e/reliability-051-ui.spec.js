import { expect, test } from "./extension.fixture.js";

async function injectLongTree(context, sidePanelPage) {
  await expect(sidePanelPage.locator(".tree-row").first()).toBeVisible();
  const windowId = await sidePanelPage.evaluate(async () => (await chrome.windows.getCurrent()).id);
  const tree = {
    windowId,
    version: 1,
    rootNodeIds: [],
    nodes: {},
    groups: {},
    selectedTabId: 1000000,
    updatedAt: Date.now()
  };
  for (let index = 0; index < 350; index += 1) {
    const tabId = 1000000 + index;
    const nodeId = `tab:${tabId}`;
    tree.rootNodeIds.push(nodeId);
    tree.nodes[nodeId] = {
      nodeId, tabId, windowId, parentNodeId: null, childNodeIds: [],
      collapsed: false, pinned: false, groupId: null, index,
      active: index === 0,
      lastKnownTitle: `Virtual test ${index}`,
      lastKnownUrl: `https://example.invalid/${index}`,
      favIconUrl: "", createdAt: 1, updatedAt: 1
    };
  }
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const sendUpdate = () => worker.evaluate(async (nextTree) => {
    // Exercise the real panel renderer without opening hundreds of browser tabs.
    await chrome.runtime.sendMessage({
      type: "STATE_UPDATED",
      payload: { windows: { [nextTree.windowId]: nextTree }, focusedWindowId: nextTree.windowId }
    }).catch(() => {});
  }, tree);
  await sendUpdate();
  await expect(sidePanelPage.locator("#tree-root")).toHaveClass(/virtualized/);
  return { tree, sendUpdate };
}

async function settleFrames(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }));
}

test("virtual updates preserve scroll and tree focus without taking focus from search", async ({ context, sidePanelPage }) => {
  const { tree, sendUpdate } = await injectLongTree(context, sidePanelPage);
  await sidePanelPage.evaluate(() => { document.querySelector("#tree-root").scrollTop = 2000; });
  await settleFrames(sidePanelPage);
  expect(await sidePanelPage.locator("#tree-root").evaluate((root) => root.scrollTop)).toBe(2000);
  expect(await sidePanelPage.locator(".tree-row").count()).toBeLessThan(350);

  const focusedTabId = await sidePanelPage.evaluate(() => {
    const root = document.querySelector("#tree-root");
    const rootRect = root.getBoundingClientRect();
    const row = [...root.querySelectorAll(".tree-row")].find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.top >= rootRect.top && rect.bottom <= rootRect.bottom;
    });
    row.querySelector('[data-action="add-child"]').focus({ preventScroll: true });
    return Number(row.dataset.tabId);
  });
  tree.nodes[`tab:${focusedTabId}`].lastKnownTitle = "Updated while button focused";
  await sendUpdate();
  const focusedRow = sidePanelPage.locator(`.tree-row[data-tab-id="${focusedTabId}"]`);
  await expect(focusedRow.locator(".title")).toHaveText("Updated while button focused");
  await expect(focusedRow.locator('[data-action="add-child"]')).toBeFocused();
  expect(await sidePanelPage.locator("#tree-root").evaluate((root) => root.scrollTop)).toBe(2000);

  await sidePanelPage.locator("#search").focus();
  tree.nodes[`tab:${focusedTabId}`].lastKnownTitle = "Updated while search focused";
  await sendUpdate();
  await expect(focusedRow.locator(".title")).toHaveText("Updated while search focused");
  await expect(sidePanelPage.locator("#search")).toBeFocused();
  expect(await sidePanelPage.locator("#tree-root").evaluate((root) => root.scrollTop)).toBe(2000);
});

test("keyboard navigation crosses virtual viewports without losing its row", async ({ context, sidePanelPage }) => {
  await injectLongTree(context, sidePanelPage);
  await sidePanelPage.locator('.tree-row[data-tab-id="1000000"]').focus();
  for (let index = 0; index < 70; index += 1) {
    await sidePanelPage.keyboard.press("ArrowDown");
  }
  await settleFrames(sidePanelPage);
  await expect(sidePanelPage.locator('.tree-row[data-tab-id="1000070"]')).toBeFocused();
  expect(await sidePanelPage.locator("#tree-root").evaluate((root) => root.scrollTop)).toBeGreaterThan(0);

  for (let index = 0; index < 70; index += 1) {
    await sidePanelPage.keyboard.press("ArrowUp");
  }
  await settleFrames(sidePanelPage);
  await expect(sidePanelPage.locator('.tree-row[data-tab-id="1000000"]')).toBeFocused();
});

test("group rename preserves its draft and caret when a tab title changes", async ({ context, sidePanelPage }) => {
  const tab = await context.newPage();
  await tab.goto("data:text/html,<title>Rename draft tab</title>");
  const groupId = await sidePanelPage.evaluate(async () => {
    const tab = (await chrome.tabs.query({ currentWindow: true })).find((item) => item.title === "Rename draft tab");
    const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
    await chrome.tabGroups.update(groupId, { title: "Original group" });
    return groupId;
  });
  const header = sidePanelPage.locator(`.group-header[data-group-id="${groupId}"]`);
  await expect(header.locator(".group-name")).toHaveText("Original group");
  await header.click({ button: "right" });
  await sidePanelPage.locator('[data-action="rename-group"]').click();
  const input = sidePanelPage.locator(".context-rename-input");
  await input.fill("My unsaved draft");
  await input.evaluate((element) => element.setSelectionRange(3, 10, "backward"));

  await tab.evaluate(() => { document.title = "Rename tab title changed"; });
  await expect(sidePanelPage.locator(".tree-row .title").filter({ hasText: "Rename tab title changed" })).toBeVisible();
  await expect(input).toHaveValue("My unsaved draft");
  await expect(input).toBeFocused();
  expect(await input.evaluate((element) => ({
    start: element.selectionStart, end: element.selectionEnd, direction: element.selectionDirection
  }))).toEqual({ start: 3, end: 10, direction: "backward" });

  await input.press("Enter");
  await expect(header.locator(".group-name")).toHaveText("My unsaved draft");
});

test("row buttons retain native Enter and Space actions", async ({ context, sidePanelPage }) => {
  const parent = await context.newPage();
  await parent.goto("data:text/html,<title>Keyboard button parent</title>");
  const parentRow = sidePanelPage.locator(".tree-row").filter({
    has: sidePanelPage.locator(".title", { hasText: "Keyboard button parent" })
  });
  await expect(parentRow).toBeVisible();
  const parentId = Number(await parentRow.getAttribute("data-tab-id"));
  const getParent = () => sidePanelPage.evaluate(async (tabId) => {
    const tab = await chrome.tabs.get(tabId);
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE", payload: { windowId: tab.windowId } });
    return response.payload.windows[tab.windowId].nodes[`tab:${tabId}`];
  }, parentId);

  await parentRow.locator('[data-action="add-child"]').focus();
  await sidePanelPage.keyboard.press("Enter");
  await expect.poll(async () => (await getParent()).childNodeIds.length).toBe(1);
  const childId = Number((await getParent()).childNodeIds[0].slice(4));

  await parentRow.locator('[data-action="toggle-collapse"]').focus();
  await sidePanelPage.keyboard.press("Space");
  await expect.poll(async () => (await getParent()).collapsed).toBe(true);
  await parentRow.locator('[data-action="toggle-collapse"]').focus();
  await sidePanelPage.keyboard.press("Enter");
  await expect.poll(async () => (await getParent()).collapsed).toBe(false);

  const childRow = sidePanelPage.locator(`.tree-row[data-tab-id="${childId}"]`);
  await expect(childRow).toBeVisible();
  await childRow.locator('[data-action="close-tab"]').focus();
  await sidePanelPage.keyboard.press("Space");
  await expect(childRow).toHaveCount(0);
  await expect(parentRow).toBeVisible();
  await expect.poll(async () => (await getParent()).childNodeIds.length).toBe(0);
});
