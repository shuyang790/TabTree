import { expect, test } from "./extension.fixture.js";

async function setupTree(context, sidePanelPage, label, count, parents) {
  const titles = Array.from({ length: count }, (_, index) => `${label} ${index + 1}`);
  for (const title of titles) {
    const page = await context.newPage();
    await page.setContent(`<title>${title}</title><main>${title}</main>`);
  }
  const ids = await sidePanelPage.evaluate(async (titles) => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return titles.map((title) => tabs.find((tab) => tab.title === title)?.id);
  }, titles);
  expect(ids.every(Number.isInteger)).toBe(true);
  for (const [child, parent] of parents) {
    const response = await sidePanelPage.evaluate(async ({ childId, parentId }) => chrome.runtime.sendMessage({
      type: "TREE_ACTION", payload: { type: "REPARENT_TAB", tabId: childId, newParentTabId: parentId }
    }), { childId: ids[child - 1], parentId: ids[parent - 1] });
    expect(response.ok).toBe(true);
  }
  await expect.poll(async () => (await snapshot(sidePanelPage, ids)).parents).toEqual(
    ids.map((_, index) => parents.find(([child]) => child === index + 1)?.[1] ?? null)
  );
  await sidePanelPage.bringToFront();
  return { ids, titles };
}

async function snapshot(page, ids) {
  return page.evaluate(async (ids) => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const windowId = tabs.find((tab) => tab.id === ids[0]).windowId;
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE", payload: { windowId } });
    const tree = response.payload.windows[windowId];
    return {
      order: tabs.filter((tab) => ids.includes(tab.id)).sort((a, b) => a.index - b.index).map((tab) => ids.indexOf(tab.id) + 1),
      parents: ids.map((id) => {
        const parent = tree.nodes[`tab:${id}`]?.parentNodeId;
        return parent ? ids.indexOf(Number(parent.slice(4))) + 1 : null;
      })
    };
  }, ids);
}

function row(page, title) {
  return page.locator(".tree-row").filter({ has: page.locator(".title", { hasText: title }) }).first();
}

async function drag(page, sourceTitle, targetTitle, position) {
  const source = row(page, sourceTitle);
  const target = row(page, targetTitle);
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  if (position === "inside") {
    const from = await source.boundingBox();
    const to = await target.boundingBox();
    const x = to.x + to.width / 2;
    const y = to.y + to.height / 2;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 12 });
    await page.mouse.move(x + 1, y, { steps: 2 });
    await expect(target).toHaveClass(/drop-valid-/);
    await page.waitForTimeout(350);
    await page.mouse.move(x, y, { steps: 2 });
    await expect(target).toHaveClass(/drop-valid-inside/);
    await page.mouse.up();
  } else {
    const box = await target.boundingBox();
    await source.dragTo(target, { targetPosition: { x: box.width / 2, y: position === "before" ? 2 : box.height - 2 } });
  }
}

test("single drag carries nested descendants into another branch and back to root", async ({ context, sidePanelPage }) => {
  const { ids, titles } = await setupTree(context, sidePanelPage, "Drag branch", 6, [[2, 1], [3, 2], [5, 4]]);
  await drag(sidePanelPage, titles[0], titles[3], "inside");
  await expect.poll(() => snapshot(sidePanelPage, ids)).toEqual({
    order: [4, 5, 1, 2, 3, 6], parents: [4, 1, 2, null, 4, null]
  });
  await row(sidePanelPage, titles[0]).dragTo(sidePanelPage.locator("#search-wrap"), { targetPosition: { x: 24, y: 18 } });
  await expect.poll(() => snapshot(sidePanelPage, ids)).toEqual({
    order: [4, 5, 6, 1, 2, 3], parents: [null, 1, 2, null, 4, null]
  });
});

test("single after drop stays beyond the target's complete subtree", async ({ context, sidePanelPage }) => {
  const { ids, titles } = await setupTree(context, sidePanelPage, "Drag after", 5, [[2, 1], [3, 2]]);
  await drag(sidePanelPage, titles[4], titles[0], "after");
  await expect.poll(() => snapshot(sidePanelPage, ids)).toEqual({
    order: [1, 2, 3, 5, 4], parents: [null, 1, 2, null, null]
  });
});

test("multi-selection containing a parent and child preserves both source and target branches", async ({ context, sidePanelPage }) => {
  const { ids, titles } = await setupTree(context, sidePanelPage, "Drag selected", 8, [[2, 1], [4, 3], [7, 6]]);
  await row(sidePanelPage, titles[2]).click();
  await row(sidePanelPage, titles[3]).click({ modifiers: ["ControlOrMeta"] });
  await row(sidePanelPage, titles[5]).click({ modifiers: ["ControlOrMeta"] });
  await drag(sidePanelPage, titles[2], titles[0], "after");
  await expect.poll(() => snapshot(sidePanelPage, ids)).toEqual({
    order: [1, 2, 3, 4, 6, 7, 5, 8], parents: [null, 1, null, 3, null, null, 6, null]
  });
});

test("inside a native group moves the source parent and every descendant together", async ({ context, sidePanelPage }) => {
  const { ids, titles } = await setupTree(context, sidePanelPage, "Drag group", 6, [[2, 1], [3, 2], [5, 4]]);
  const groupId = await sidePanelPage.evaluate(async (ids) => {
    const target = await chrome.tabs.get(ids[3]);
    return chrome.tabs.group({ tabIds: [ids[3], ids[4]], createProperties: { windowId: target.windowId } });
  }, ids);
  await expect.poll(() => sidePanelPage.evaluate(async (ids) => {
    const tab = await chrome.tabs.get(ids[3]);
    const result = await chrome.runtime.sendMessage({ type: "GET_STATE", payload: { windowId: tab.windowId } });
    return result.payload.windows[tab.windowId].nodes[`tab:${ids[3]}`].groupId;
  }, ids)).toBe(groupId);
  await drag(sidePanelPage, titles[0], titles[3], "inside");
  await expect.poll(() => snapshot(sidePanelPage, ids)).toEqual({
    order: [4, 5, 1, 2, 3, 6], parents: [4, 1, 2, null, 4, null]
  });
  expect(await sidePanelPage.evaluate(async (ids) => Promise.all(ids.slice(0, 5).map(async (id) => (await chrome.tabs.get(id)).groupId)), ids))
    .toEqual(Array(5).fill(groupId));
});
