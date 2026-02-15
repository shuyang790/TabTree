import { expect, test } from "./extension.fixture.js";

async function createTitledTab(context, title) {
  const page = await context.newPage();
  await page.setContent(`<title>${title}</title><main>${title}</main>`);
  await expect.poll(() => page.title()).toBe(title);
  return page;
}

async function dispatchFocusSearchFromServiceWorker(context) {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }
  await serviceWorker.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: "FOCUS_SEARCH" });
  });
}

async function activeSearchMatchTitle(sidePanelPage) {
  return sidePanelPage.evaluate(() => {
    const row = document.querySelector(".tree-row.search-match-active");
    return row?.querySelector(".title")?.textContent?.trim() || null;
  });
}

async function activeChromeTabTitle(sidePanelPage) {
  return sidePanelPage.evaluate(async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    return tabs[0]?.title || null;
  });
}

async function orderedTitlesWithPrefix(sidePanelPage, prefix) {
  return sidePanelPage.evaluate((targetPrefix) => {
    return Array.from(document.querySelectorAll(".tree-row[data-tab-id] .title"))
      .map((el) => el.textContent?.trim() || "")
      .filter((text) => text.startsWith(targetPrefix));
  }, prefix);
}

async function isTreeRowFocused(sidePanelPage) {
  return sidePanelPage.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement && active.classList.contains("tree-row");
  });
}

function rowByTitle(sidePanelPage, title) {
  return sidePanelPage
    .locator(".tree-row")
    .filter({ has: sidePanelPage.locator(".title", { hasText: title }) })
    .first();
}

async function tabIdByTitle(sidePanelPage, title) {
  return sidePanelPage.evaluate(async (tabTitle) => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs.find((tab) => tab.title === tabTitle)?.id ?? null;
  }, title);
}

async function getCurrentWindowTree(sidePanelPage) {
  return sidePanelPage.evaluate(async () => {
    const windowId = (await chrome.windows.getCurrent()).id;
    const response = await chrome.runtime.sendMessage({
      type: "GET_STATE",
      payload: { windowId }
    });
    const windows = response?.payload?.windows || {};
    return windows[windowId] || windows[String(windowId)] || null;
  });
}

function nodeByTitle(tree, title) {
  const nodes = Object.values(tree?.nodes || {});
  return nodes.find((node) => node.lastKnownTitle === title) || null;
}

function rootTitles(tree) {
  return (tree?.rootNodeIds || [])
    .map((nodeId) => tree.nodes[nodeId]?.lastKnownTitle || "")
    .filter((title) => !!title);
}

function childTitles(tree, parentTitle) {
  const parent = nodeByTitle(tree, parentTitle);
  if (!parent) {
    return [];
  }
  return parent.childNodeIds
    .map((nodeId) => tree.nodes[nodeId]?.lastKnownTitle || "")
    .filter((title) => !!title);
}

async function nativeOrderByTitles(sidePanelPage, titles) {
  return sidePanelPage.evaluate(async (trackedTitles) => {
    const tracked = new Set(trackedTitles);
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs
      .sort((a, b) => a.index - b.index)
      .map((tab) => tab.title || "")
      .filter((title) => tracked.has(title));
  }, titles);
}

async function treeOrderByTitles(sidePanelPage, titles) {
  const tree = await getCurrentWindowTree(sidePanelPage);
  const tracked = new Set(titles);
  return Object.values(tree?.nodes || {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((node) => node.lastKnownTitle || "")
    .filter((title) => tracked.has(title));
}

async function activeTreeRowTitle(sidePanelPage) {
  return sidePanelPage.evaluate(() => {
    const row = document.querySelector(".tree-row.active");
    return row?.querySelector(".title")?.textContent?.trim() || null;
  });
}

async function expectTreeAndNativeOrderMatch(sidePanelPage, titles, expectedOrder) {
  await expect.poll(async () => {
    const [treeOrder, nativeOrder] = await Promise.all([
      treeOrderByTitles(sidePanelPage, titles),
      nativeOrderByTitles(sidePanelPage, titles)
    ]);
    return { treeOrder, nativeOrder };
  }).toEqual({
    treeOrder: expectedOrder,
    nativeOrder: expectedOrder
  });
}

async function syncInvariantSummary(sidePanelPage, trackedTitles) {
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
    const trackedNativeTitles = trackedNativeTabs.map((tab) => tab.title || "");
    const trackedNativeIds = trackedNativeTabs.map((tab) => tab.id);
    const trackedTreeNodes = Object.values(tree?.nodes || {})
      .filter((node) => tracked.has(node.lastKnownTitle || ""));
    const trackedTreeIds = trackedTreeNodes.map((node) => node.tabId);
    const trackedTreeTitles = trackedTreeNodes
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((node) => node.lastKnownTitle || "");
    const nativeOnlyTabIds = trackedNativeIds.filter((id) => !trackedTreeIds.includes(id));
    const treeOnlyTabIds = trackedTreeIds.filter((id) => !trackedNativeIds.includes(id));
    const activeTabId = tabs.find((tab) => tab.active)?.id ?? null;
    return {
      trackedNativeTitles,
      trackedTreeTitles,
      nativeOnlyTabIds,
      treeOnlyTabIds,
      selectedTabId: tree?.selectedTabId ?? null,
      activeTabId
    };
  }, trackedTitles);
}

async function dragRowToRow(sidePanelPage, sourceTitle, targetTitle, position) {
  const source = rowByTitle(sidePanelPage, sourceTitle);
  const target = rowByTitle(sidePanelPage, targetTitle);
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  if (position === "inside") {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).toBeTruthy();
    expect(targetBox).toBeTruthy();

    const sourceX = Math.floor(sourceBox.x + Math.max(12, sourceBox.width / 2));
    const sourceY = Math.floor(sourceBox.y + Math.max(8, sourceBox.height / 2));
    const targetX = Math.floor(targetBox.x + Math.max(12, targetBox.width / 2));
    const targetY = Math.floor(targetBox.y + Math.max(8, targetBox.height / 2));

    await sidePanelPage.mouse.move(sourceX, sourceY);
    await sidePanelPage.mouse.down();
    await sidePanelPage.mouse.move(targetX, targetY, { steps: 12 });
    await sidePanelPage.waitForTimeout(230);
    await sidePanelPage.mouse.move(targetX + 1, targetY, { steps: 2 });
    await sidePanelPage.mouse.move(targetX, targetY, { steps: 2 });
    await sidePanelPage.mouse.up();
    return;
  }

  const box = await target.boundingBox();
  expect(box).toBeTruthy();
  const y = position === "before"
    ? 2
    : position === "after"
      ? Math.max(2, Math.floor(box.height - 2))
      : Math.max(2, Math.floor(box.height / 2));
  const x = Math.max(8, Math.floor(box.width / 2));
  await source.dragTo(target, {
    targetPosition: { x, y }
  });
}

async function dragRowToSearchRoot(sidePanelPage, sourceTitle) {
  const source = rowByTitle(sidePanelPage, sourceTitle);
  const rootDropTarget = sidePanelPage.locator("#search-wrap");
  await expect(source).toBeVisible();
  await expect(rootDropTarget).toBeVisible();
  await source.dragTo(rootDropTarget, {
    targetPosition: { x: 24, y: 18 }
  });
}

async function dragRowToBottomRoot(sidePanelPage, sourceTitle) {
  const source = rowByTitle(sidePanelPage, sourceTitle);
  await expect(source).toBeVisible();
  const bottomRootDropTarget = sidePanelPage.locator("#bottom-root-drop-zone");
  await expect(bottomRootDropTarget).toBeVisible();
  await source.dragTo(bottomRootDropTarget, {
    targetPosition: { x: 24, y: 14 }
  });
}

async function closeTabsByPrefix(sidePanelPage, prefix) {
  await sidePanelPage.evaluate(async (targetPrefix) => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const toClose = tabs
      .filter((tab) => (tab.title || "").startsWith(targetPrefix))
      .map((tab) => tab.id);
    if (toClose.length) {
      await chrome.tabs.remove(toClose);
    }
  }, prefix);
}

function groupHeaderByContainedRowTitle(sidePanelPage, rowTitle) {
  return sidePanelPage
    .locator(".group-section")
    .filter({ has: rowByTitle(sidePanelPage, rowTitle) })
    .first()
    .locator(".group-header");
}

async function dragGroupHeaderToRow(sidePanelPage, sourceRowTitle, targetRowTitle, position) {
  const sourceHeader = groupHeaderByContainedRowTitle(sidePanelPage, sourceRowTitle);
  const targetRow = rowByTitle(sidePanelPage, targetRowTitle);
  await expect(sourceHeader).toBeVisible();
  await expect(targetRow).toBeVisible();

  const box = await targetRow.boundingBox();
  expect(box).toBeTruthy();
  const y = position === "before" ? 2 : Math.max(2, Math.floor(box.height - 2));
  const x = Math.max(8, Math.floor(box.width / 2));
  await sourceHeader.dragTo(targetRow, {
    targetPosition: { x, y }
  });
}

test.describe("TabTree extension", () => {
  test("loads side panel app shell", async ({ sidePanelPage }) => {
    await expect(sidePanelPage.locator("#search")).toBeVisible();
    await expect(sidePanelPage.locator("#open-settings")).toBeVisible();
    await expect(sidePanelPage.locator("#add-child-global")).toBeVisible();
    await expect(sidePanelPage.locator(".tree-root")).toBeVisible();
  });

  test("focus-search command path focuses search and supports arrow/enter navigation", async ({ context, sidePanelPage }) => {
    const pages = [];
    try {
      const titles = [
        "E2E FocusSearch Alpha",
        "E2E FocusSearch Beta",
        "E2E FocusSearch Gamma"
      ];
      for (const title of titles) {
        pages.push(await createTitledTab(context, title));
      }

      await sidePanelPage.locator("#open-settings").focus();
      await dispatchFocusSearchFromServiceWorker(context);
      await expect(sidePanelPage.locator("#search")).toBeFocused();

      await sidePanelPage.locator("#search").fill("E2E FocusSearch");

      await expect.poll(async () => sidePanelPage.evaluate(() => {
        return Array.from(document.querySelectorAll(".tree-row[data-tab-id] .title"))
          .map((el) => el.textContent?.trim() || "")
          .filter((text) => text.startsWith("E2E FocusSearch")).length;
      })).toBe(3);

      const orderedTitles = await sidePanelPage.evaluate(() => {
        return Array.from(document.querySelectorAll(".tree-row[data-tab-id] .title"))
          .map((el) => el.textContent?.trim() || "")
          .filter((text) => text.startsWith("E2E FocusSearch"));
      });
      expect(orderedTitles.length).toBe(3);

      const [first, second] = orderedTitles;
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(first);
      await sidePanelPage.locator("#search").press("ArrowDown");
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(second);
      await sidePanelPage.locator("#search").press("ArrowUp");
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(first);

      await sidePanelPage.locator("#search").press("Enter");
      await expect.poll(() => activeChromeTabTitle(sidePanelPage)).toBe(first);
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("focus-search message focuses search when another tab page is frontmost", async ({ context, sidePanelPage }) => {
    const frontPage = await context.newPage();
    try {
      await frontPage.setContent("<title>E2E Front Page</title><main>front</main>");
      await frontPage.bringToFront();
      await dispatchFocusSearchFromServiceWorker(context);
      await sidePanelPage.bringToFront();
      await expect(sidePanelPage.locator("#search")).toBeFocused();
    } finally {
      await frontPage.close().catch(() => {});
    }
  });

  test("search Escape clears query first, then blurs to a tree row", async ({ context, sidePanelPage }) => {
    const pages = [];
    try {
      const titles = ["E2E Escape One", "E2E Escape Two"];
      for (const title of titles) {
        pages.push(await createTitledTab(context, title));
      }

      await dispatchFocusSearchFromServiceWorker(context);
      await expect(sidePanelPage.locator("#search")).toBeFocused();
      await sidePanelPage.locator("#search").fill("E2E Escape");

      await expect.poll(async () => orderedTitlesWithPrefix(sidePanelPage, "E2E Escape"))
        .toHaveLength(2);

      await sidePanelPage.locator("#search").press("Escape");
      await expect(sidePanelPage.locator("#search")).toHaveValue("");
      await expect.poll(async () => orderedTitlesWithPrefix(sidePanelPage, "E2E Escape"))
        .toHaveLength(2);

      await sidePanelPage.locator("#search").press("Escape");
      await expect.poll(() => isTreeRowFocused(sidePanelPage)).toBe(true);
      await expect(sidePanelPage.locator("#search")).not.toBeFocused();
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("search Enter does not switch tabs when there are no matches", async ({ context, sidePanelPage }) => {
    const pages = [];
    try {
      const anchorTitle = "E2E NoMatch Anchor";
      pages.push(await createTitledTab(context, anchorTitle));
      pages.push(await createTitledTab(context, "E2E NoMatch Other"));

      const anchorRow = rowByTitle(sidePanelPage, anchorTitle);
      await expect(anchorRow).toBeVisible();
      await anchorRow.click();
      await expect.poll(() => activeChromeTabTitle(sidePanelPage)).toBe(anchorTitle);

      await dispatchFocusSearchFromServiceWorker(context);
      await sidePanelPage.locator("#search").fill("zzzzzz-e2e-no-match");
      await expect(sidePanelPage.locator(".tree-row[data-tab-id]")).toHaveCount(0);

      await sidePanelPage.locator("#search").press("Enter");
      await expect.poll(() => activeChromeTabTitle(sidePanelPage)).toBe(anchorTitle);
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("search ArrowUp and ArrowDown wrap across match boundaries", async ({ context, sidePanelPage }) => {
    const pages = [];
    try {
      const titles = ["E2E Wrap Alpha", "E2E Wrap Beta", "E2E Wrap Gamma"];
      for (const title of titles) {
        pages.push(await createTitledTab(context, title));
      }

      await dispatchFocusSearchFromServiceWorker(context);
      await sidePanelPage.locator("#search").fill("E2E Wrap");

      await expect.poll(async () => orderedTitlesWithPrefix(sidePanelPage, "E2E Wrap"))
        .toHaveLength(3);
      const orderedTitles = await orderedTitlesWithPrefix(sidePanelPage, "E2E Wrap");
      const [first, second, third] = orderedTitles;

      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(first);
      await sidePanelPage.locator("#search").press("ArrowUp");
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(third);
      await sidePanelPage.locator("#search").press("ArrowDown");
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(first);
      await sidePanelPage.locator("#search").press("ArrowDown");
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(second);
      await sidePanelPage.locator("#search").press("ArrowDown");
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(third);
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("closing the active matched tab advances search highlight to the next match", async ({ context, sidePanelPage }) => {
    const pages = [];
    try {
      const titles = ["E2E Invalidate One", "E2E Invalidate Two", "E2E Invalidate Three"];
      for (const title of titles) {
        pages.push(await createTitledTab(context, title));
      }

      await dispatchFocusSearchFromServiceWorker(context);
      await sidePanelPage.locator("#search").fill("E2E Invalidate");
      await expect.poll(async () => orderedTitlesWithPrefix(sidePanelPage, "E2E Invalidate"))
        .toHaveLength(3);
      const ordered = await orderedTitlesWithPrefix(sidePanelPage, "E2E Invalidate");
      const [, second, third] = ordered;

      await sidePanelPage.locator("#search").press("ArrowDown");
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(second);

      const secondTabId = await tabIdByTitle(sidePanelPage, second);
      expect(Number.isInteger(secondTabId)).toBeTruthy();
      await sidePanelPage.evaluate(async (tabId) => {
        await chrome.tabs.remove(tabId);
      }, secondTabId);

      await expect.poll(() => orderedTitlesWithPrefix(sidePanelPage, "E2E Invalidate"))
        .toHaveLength(2);
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(third);
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("search query and active match persist after Enter activation", async ({ context, sidePanelPage }) => {
    const pages = [];
    try {
      const query = "E2E Persist";
      const titles = ["E2E Persist One", "E2E Persist Two", "E2E Persist Three"];
      for (const title of titles) {
        pages.push(await createTitledTab(context, title));
      }

      await dispatchFocusSearchFromServiceWorker(context);
      await sidePanelPage.locator("#search").fill(query);
      await expect.poll(async () => orderedTitlesWithPrefix(sidePanelPage, query))
        .toHaveLength(3);
      const ordered = await orderedTitlesWithPrefix(sidePanelPage, query);
      const [, second] = ordered;

      await sidePanelPage.locator("#search").press("ArrowDown");
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(second);
      await sidePanelPage.locator("#search").press("Enter");

      await expect.poll(() => activeChromeTabTitle(sidePanelPage)).toBe(second);
      await expect(sidePanelPage.locator("#search")).toHaveValue(query);
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(second);
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("focus-search stays reliable after side panel reload", async ({ context, sidePanelPage }) => {
    await sidePanelPage.reload();
    await expect(sidePanelPage.locator("#search")).toBeVisible();

    await sidePanelPage.locator("#open-settings").focus();
    await dispatchFocusSearchFromServiceWorker(context);
    await expect(sidePanelPage.locator("#search")).toBeFocused();

    await sidePanelPage.locator("#open-settings").focus();
    await dispatchFocusSearchFromServiceWorker(context);
    await expect(sidePanelPage.locator("#search")).toBeFocused();
  });

  test("search navigation is isolated while context menu or confirm modal is open", async ({ context, sidePanelPage }) => {
    const pages = [];
    try {
      const titles = ["E2E Isolation Alpha", "E2E Isolation Beta"];
      for (const title of titles) {
        pages.push(await createTitledTab(context, title));
      }

      await dispatchFocusSearchFromServiceWorker(context);
      await sidePanelPage.locator("#search").fill("E2E Isolation");
      await expect.poll(async () => orderedTitlesWithPrefix(sidePanelPage, "E2E Isolation"))
        .toHaveLength(2);
      const ordered = await orderedTitlesWithPrefix(sidePanelPage, "E2E Isolation");
      const [first] = ordered;
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(first);

      const firstRow = rowByTitle(sidePanelPage, "E2E Isolation Alpha");
      await firstRow.click({ button: "right" });
      await expect(sidePanelPage.locator("#context-menu")).toBeVisible();

      await sidePanelPage.keyboard.press("ArrowDown");
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(first);
      await expect.poll(async () => sidePanelPage.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLElement && active.classList.contains("context-menu-item");
      })).toBe(true);

      await sidePanelPage.keyboard.press("Escape");
      await expect(sidePanelPage.locator("#context-menu")).toBeHidden();

      const rowA = rowByTitle(sidePanelPage, "E2E Isolation Alpha");
      const rowB = rowByTitle(sidePanelPage, "E2E Isolation Beta");
      await rowA.click();
      await rowB.click({ modifiers: ["Shift"] });
      await rowB.click({ button: "right" });
      await sidePanelPage.locator('.context-menu-item[data-action="close-selected-tabs"]').click();

      const confirmOverlay = sidePanelPage.locator("#confirm-overlay");
      await expect(confirmOverlay).toBeVisible();
      await sidePanelPage.keyboard.press("Escape");
      await expect(confirmOverlay).toBeHidden();

      await expect(sidePanelPage.locator("#search")).toHaveValue("E2E Isolation");
      await expect.poll(() => activeSearchMatchTitle(sidePanelPage)).toBe(first);
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("opens settings panel and persists a setting", async ({ sidePanelPage }) => {
    await sidePanelPage.locator("#open-settings").click();
    const densitySelect = sidePanelPage.locator('select[name="density"]');
    await expect(densitySelect).toBeVisible();

    await densitySelect.selectOption("compact");

    await sidePanelPage.reload();
    await sidePanelPage.locator("#open-settings").click();
    await expect(sidePanelPage.locator('select[name="density"]')).toHaveValue("compact");
  });

  test("settings section reset buttons restore defaults for their section", async ({ sidePanelPage }) => {
    await sidePanelPage.locator("#open-settings").click();

    const densitySelect = sidePanelPage.locator('select[name="density"]');
    const showFavicons = sidePanelPage.locator('input[name="showFavicons"]');
    const confirmCloseBatch = sidePanelPage.locator('input[name="confirmCloseBatch"]');

    await densitySelect.selectOption("compact");
    await showFavicons.uncheck();
    await confirmCloseBatch.uncheck();

    await sidePanelPage.locator("#reset-appearance-settings").click();
    await expect(densitySelect).toHaveValue("comfortable");

    await sidePanelPage.locator("#reset-behavior-settings").click();
    await expect(showFavicons).toBeChecked();

    await sidePanelPage.locator("#reset-safety-settings").click();
    await expect(confirmCloseBatch).toBeChecked();
  });

  test("add child action opens a new tab", async ({ context, sidePanelPage }) => {
    const beforeCount = context.pages().length;

    await sidePanelPage.locator("#add-child-global").click();

    await expect
      .poll(() => context.pages().length, { message: "Expected add-child to create a new tab" })
      .toBeGreaterThan(beforeCount);
  });

  test("native tab activation updates the active row in the side panel", async ({ context, sidePanelPage }) => {
    const pages = [];
    try {
      const titles = [
        "Native Activate Alpha",
        "Native Activate Beta",
        "Native Activate Gamma"
      ];
      for (const title of titles) {
        pages.push(await createTitledTab(context, title));
      }

      const activateTitle = "Native Activate Beta";
      const activateTabId = await tabIdByTitle(sidePanelPage, activateTitle);
      expect(Number.isInteger(activateTabId)).toBeTruthy();

      await sidePanelPage.evaluate(async (tabId) => {
        await chrome.tabs.update(tabId, { active: true });
      }, activateTabId);

      await expect.poll(() => activeChromeTabTitle(sidePanelPage)).toBe(activateTitle);
      await expect.poll(() => activeTreeRowTitle(sidePanelPage)).toBe(activateTitle);
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("clicking a side panel row activates the same native tab", async ({ context, sidePanelPage }) => {
    const pages = [];
    try {
      const firstTitle = "Panel Activate One";
      const secondTitle = "Panel Activate Two";
      pages.push(await createTitledTab(context, firstTitle));
      pages.push(await createTitledTab(context, secondTitle));

      const firstRow = rowByTitle(sidePanelPage, firstTitle);
      const secondRow = rowByTitle(sidePanelPage, secondTitle);
      await expect(firstRow).toBeVisible();
      await expect(secondRow).toBeVisible();

      await firstRow.click();
      await expect.poll(() => activeChromeTabTitle(sidePanelPage)).toBe(firstTitle);
      await expect.poll(() => activeTreeRowTitle(sidePanelPage)).toBe(firstTitle);

      await secondRow.click();
      await expect.poll(() => activeChromeTabTitle(sidePanelPage)).toBe(secondTitle);
      await expect.poll(() => activeTreeRowTitle(sidePanelPage)).toBe(secondTitle);
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("native activation of a child tab expands collapsed ancestors and selects the child row", async ({ context, sidePanelPage }) => {
    const pages = [];
    try {
      const parentTitle = "Reveal Parent Root";
      const childTitle = "Reveal Hidden Child";
      const siblingTitle = "Reveal Sibling";
      for (const title of [parentTitle, childTitle, siblingTitle]) {
        pages.push(await createTitledTab(context, title));
      }

      const parentTabId = await tabIdByTitle(sidePanelPage, parentTitle);
      const childTabId = await tabIdByTitle(sidePanelPage, childTitle);
      expect(Number.isInteger(parentTabId)).toBeTruthy();
      expect(Number.isInteger(childTabId)).toBeTruthy();

      await sidePanelPage.evaluate(async ({ parentTabId, childTabId }) => {
        await chrome.runtime.sendMessage({
          type: "TREE_ACTION",
          payload: {
            type: "REPARENT_TAB",
            tabId: childTabId,
            newParentTabId: parentTabId
          }
        });
      }, { parentTabId, childTabId });

      await expect.poll(async () => {
        const tree = await getCurrentWindowTree(sidePanelPage);
        return childTitles(tree, parentTitle);
      }).toEqual([childTitle]);

      const parentRow = rowByTitle(sidePanelPage, parentTitle);
      await parentRow.locator('[data-action="toggle-collapse"]').click();
      await expect.poll(async () => {
        const tree = await getCurrentWindowTree(sidePanelPage);
        const parentNode = nodeByTitle(tree, parentTitle);
        return !!parentNode?.collapsed;
      }).toBe(true);
      await expect(rowByTitle(sidePanelPage, childTitle)).toHaveCount(0);

      await sidePanelPage.evaluate(async (tabId) => {
        await chrome.tabs.update(tabId, { active: true });
      }, childTabId);

      const childRow = rowByTitle(sidePanelPage, childTitle);
      await expect(childRow).toBeVisible();
      await expect.poll(() => activeChromeTabTitle(sidePanelPage)).toBe(childTitle);
      await expect.poll(() => activeTreeRowTitle(sidePanelPage)).toBe(childTitle);
      await expect.poll(async () => {
        return childRow.evaluate((row) => ({
          active: row.classList.contains("active"),
          selected: row.classList.contains("selected")
        }));
      }).toEqual({
        active: true,
        selected: true
      });

      await expect.poll(async () => {
        const tree = await getCurrentWindowTree(sidePanelPage);
        const parentNode = nodeByTitle(tree, parentTitle);
        return !!parentNode?.collapsed;
      }).toBe(false);
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("native tab moves are reflected in tree order", async ({ context, sidePanelPage }) => {
    const pages = [];
    try {
      const titles = [
        "Native Move A",
        "Native Move B",
        "Native Move C",
        "Native Move D"
      ];
      for (const title of titles) {
        pages.push(await createTitledTab(context, title));
      }

      await sidePanelPage.evaluate(async ({ moveTitle, anchorTitle }) => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const moveTab = tabs.find((tab) => tab.title === moveTitle);
        const anchorTab = tabs.find((tab) => tab.title === anchorTitle);
        if (!moveTab || !anchorTab) {
          throw new Error("Move setup failed");
        }
        await chrome.tabs.move(moveTab.id, { index: anchorTab.index });
      }, {
        moveTitle: "Native Move D",
        anchorTitle: "Native Move B"
      });

      await expectTreeAndNativeOrderMatch(sidePanelPage, titles, [
        "Native Move A",
        "Native Move D",
        "Native Move B",
        "Native Move C"
      ]);

      await sidePanelPage.evaluate(async ({ moveTitle, anchorTitle }) => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const moveTab = tabs.find((tab) => tab.title === moveTitle);
        const anchorTab = tabs.find((tab) => tab.title === anchorTitle);
        if (!moveTab || !anchorTab) {
          throw new Error("Second move setup failed");
        }
        await chrome.tabs.move(moveTab.id, { index: anchorTab.index + 1 });
      }, {
        moveTitle: "Native Move A",
        anchorTitle: "Native Move C"
      });

      await expectTreeAndNativeOrderMatch(sidePanelPage, titles, [
        "Native Move D",
        "Native Move B",
        "Native Move C",
        "Native Move A"
      ]);
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("invalid pinned-unpinned drag does not mutate tree or native order", async ({ context, sidePanelPage }) => {
    const pinnedPage = await createTitledTab(context, "Pinned Boundary Source");
    const regularPage = await createTitledTab(context, "Pinned Boundary Target");
    const pinnedTabId = await tabIdByTitle(sidePanelPage, "Pinned Boundary Source");
    expect(Number.isInteger(pinnedTabId)).toBeTruthy();

    await sidePanelPage.evaluate(async (tabId) => {
      await chrome.tabs.update(tabId, { pinned: true });
    }, pinnedTabId);

    const trackedTitles = ["Pinned Boundary Source", "Pinned Boundary Target"];
    const baseline = await nativeOrderByTitles(sidePanelPage, trackedTitles);
    await expectTreeAndNativeOrderMatch(sidePanelPage, trackedTitles, baseline);

    await dragRowToRow(sidePanelPage, "Pinned Boundary Source", "Pinned Boundary Target", "inside");

    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      const pinnedNode = nodeByTitle(tree, "Pinned Boundary Source");
      const targetChildren = childTitles(tree, "Pinned Boundary Target");
      return {
        pinnedParentNodeId: pinnedNode?.parentNodeId ?? null,
        becameChild: targetChildren.includes("Pinned Boundary Source")
      };
    }).toEqual({
      pinnedParentNodeId: null,
      becameChild: false
    });

    await expectTreeAndNativeOrderMatch(sidePanelPage, trackedTitles, baseline);

    await pinnedPage.close().catch(() => {});
    await regularPage.close().catch(() => {});
  });

  test("group collapse stays synchronized between side panel and native tab group", async ({ context, sidePanelPage }) => {
    const tabA = await createTitledTab(context, "Group Collapse Sync A");
    const tabB = await createTitledTab(context, "Group Collapse Sync B");
    const result = await sidePanelPage.evaluate(async ({ titleA, titleB, groupTitle }) => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const tabA = tabs.find((tab) => tab.title === titleA);
      const tabB = tabs.find((tab) => tab.title === titleB);
      if (!tabA || !tabB) {
        throw new Error("Group setup tabs missing");
      }
      const groupId = await chrome.tabs.group({ tabIds: [tabA.id, tabB.id] });
      await chrome.tabGroups.update(groupId, { title: groupTitle });
      return { groupId };
    }, {
      titleA: "Group Collapse Sync A",
      titleB: "Group Collapse Sync B",
      groupTitle: "Group Collapse Sync"
    });
    const groupId = result.groupId;
    expect(Number.isInteger(groupId)).toBeTruthy();

    const groupHeader = sidePanelPage.locator(`.group-header[data-group-id="${groupId}"]`).first();
    const groupChildren = sidePanelPage.locator(`.group-header[data-group-id="${groupId}"] + .group-children`).first();
    await expect(groupHeader).toBeVisible();
    await expect(groupChildren).toBeVisible();

    await groupHeader.click();
    await expect.poll(async () => sidePanelPage.evaluate(async (id) => {
      const group = await chrome.tabGroups.get(id);
      return !!group?.collapsed;
    }, groupId)).toBe(true);
    await expect(groupHeader).toHaveAttribute("aria-expanded", "false");
    await expect(groupChildren).toBeHidden();

    await sidePanelPage.evaluate(async (id) => {
      await chrome.tabGroups.update(id, { collapsed: false });
    }, groupId);

    // Drive a native tab-move event to force a full window ordering refresh.
    await sidePanelPage.evaluate(async (id) => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const grouped = tabs
        .filter((tab) => tab.groupId === id)
        .sort((a, b) => a.index - b.index);
      if (grouped.length >= 2) {
        await chrome.tabs.move(grouped[1].id, { index: grouped[0].index });
      }
    }, groupId);

    await expect.poll(async () => sidePanelPage.evaluate(async (id) => {
      const group = await chrome.tabGroups.get(id);
      return !!group?.collapsed;
    }, groupId)).toBe(false);
    await expect(groupHeader).toHaveAttribute("aria-expanded", "true");
    await expect(groupChildren).toBeVisible();

    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
  });

  test("moving a tab across windows updates both trees without duplicates", async ({ context, extensionId, sidePanelPage }) => {
    const sidePanelUrl = `chrome-extension://${extensionId}/sidepanel/index.html`;
    const moveTitle = "Cross Window Move Target";
    const windowOneId = await sidePanelPage.evaluate(async () => (await chrome.windows.getCurrent()).id);

    const sidePanelTwoPromise = context.waitForEvent("page");
    await sidePanelPage.evaluate(async (url) => {
      await chrome.windows.create({ url });
    }, sidePanelUrl);
    const sidePanelPageTwo = await sidePanelTwoPromise;
    await sidePanelPageTwo.waitForLoadState("domcontentloaded");

    try {
      const windowTwoId = await sidePanelPageTwo.evaluate(async () => (await chrome.windows.getCurrent()).id);
      expect(windowTwoId).not.toBe(windowOneId);

      const movedTabId = await sidePanelPage.evaluate(async ({ windowId, title }) => {
        const tab = await chrome.tabs.create({
          windowId,
          url: `data:text/html,${encodeURIComponent(`<title>${title}</title><main>${title}</main>`)}`
        });
        return tab.id;
      }, { windowId: windowOneId, title: moveTitle });
      expect(Number.isInteger(movedTabId)).toBeTruthy();

      await expect(rowByTitle(sidePanelPage, moveTitle)).toBeVisible();
      await expect(rowByTitle(sidePanelPageTwo, moveTitle)).toHaveCount(0);

      await sidePanelPage.evaluate(async ({ tabId, windowId }) => {
        await chrome.tabs.move(tabId, { windowId, index: -1 });
      }, { tabId: movedTabId, windowId: windowTwoId });

      await expect(rowByTitle(sidePanelPage, moveTitle)).toHaveCount(0);
      await expect(rowByTitle(sidePanelPageTwo, moveTitle)).toBeVisible();

      await expect.poll(async () => sidePanelPage.evaluate(async ({ windowOneId, windowTwoId, title }) => {
        const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
        const windows = response?.payload?.windows || {};
        const treeOne = windows[windowOneId] || windows[String(windowOneId)] || null;
        const treeTwo = windows[windowTwoId] || windows[String(windowTwoId)] || null;
        const inOne = Object.values(treeOne?.nodes || {}).filter((node) => node.lastKnownTitle === title).length;
        const inTwo = Object.values(treeTwo?.nodes || {}).filter((node) => node.lastKnownTitle === title).length;
        return { inOne, inTwo };
      }, { windowOneId, windowTwoId, title: moveTitle })).toEqual({ inOne: 0, inTwo: 1 });
    } finally {
      await sidePanelPageTwo.close().catch(() => {});
    }
  });

  test("native close of parent promotes children and keeps order synced", async ({ context, sidePanelPage }) => {
    const pages = [];
    try {
      const parentTitle = "Native Parent Close Root";
      const childATitle = "Native Parent Close Child A";
      const childBTitle = "Native Parent Close Child B";
      for (const title of [parentTitle, childATitle, childBTitle]) {
        pages.push(await createTitledTab(context, title));
      }

      const parentTabId = await tabIdByTitle(sidePanelPage, parentTitle);
      const childATabId = await tabIdByTitle(sidePanelPage, childATitle);
      const childBTabId = await tabIdByTitle(sidePanelPage, childBTitle);
      expect(Number.isInteger(parentTabId)).toBeTruthy();
      expect(Number.isInteger(childATabId)).toBeTruthy();
      expect(Number.isInteger(childBTabId)).toBeTruthy();

      await sidePanelPage.evaluate(async ({ parentTabId, childATabId, childBTabId }) => {
        await chrome.runtime.sendMessage({
          type: "TREE_ACTION",
          payload: { type: "REPARENT_TAB", tabId: childATabId, newParentTabId: parentTabId }
        });
        await chrome.runtime.sendMessage({
          type: "TREE_ACTION",
          payload: { type: "REPARENT_TAB", tabId: childBTabId, newParentTabId: parentTabId }
        });
      }, { parentTabId, childATabId, childBTabId });

      await expect.poll(async () => {
        const tree = await getCurrentWindowTree(sidePanelPage);
        return childTitles(tree, parentTitle);
      }).toEqual([childATitle, childBTitle]);

      await sidePanelPage.evaluate(async (tabId) => {
        await chrome.tabs.remove(tabId);
      }, parentTabId);

      await expect(rowByTitle(sidePanelPage, parentTitle)).toHaveCount(0);
      await expectTreeAndNativeOrderMatch(sidePanelPage, [childATitle, childBTitle], [childATitle, childBTitle]);
      await expect.poll(async () => {
        const tree = await getCurrentWindowTree(sidePanelPage);
        const childA = nodeByTitle(tree, childATitle);
        const childB = nodeByTitle(tree, childBTitle);
        return {
          childAParentNodeId: childA?.parentNodeId ?? null,
          childBParentNodeId: childB?.parentNodeId ?? null
        };
      }).toEqual({
        childAParentNodeId: null,
        childBParentNodeId: null
      });
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("mixed native and tree actions preserve tree-native sync invariants", async ({ context, sidePanelPage }) => {
    const pages = [];
    const titles = [
      "Stress Sync A",
      "Stress Sync B",
      "Stress Sync C",
      "Stress Sync D",
      "Stress Sync E",
      "Stress Sync F"
    ];

    const assertSyncInvariants = async () => {
      await expect.poll(async () => {
        const summary = await syncInvariantSummary(sidePanelPage, titles);
        return {
          sameOrder: JSON.stringify(summary.trackedTreeTitles) === JSON.stringify(summary.trackedNativeTitles),
          nativeOnlyCount: summary.nativeOnlyTabIds.length,
          treeOnlyCount: summary.treeOnlyTabIds.length,
          selectedMatchesActive: summary.selectedTabId === summary.activeTabId
        };
      }).toEqual({
        sameOrder: true,
        nativeOnlyCount: 0,
        treeOnlyCount: 0,
        selectedMatchesActive: true
      });
    };

    try {
      for (const title of titles) {
        pages.push(await createTitledTab(context, title));
      }
      await assertSyncInvariants();

      await sidePanelPage.evaluate(async ({ titleA, titleB }) => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const tabA = tabs.find((tab) => tab.title === titleA);
        const tabB = tabs.find((tab) => tab.title === titleB);
        if (!tabA || !tabB) {
          throw new Error("Group setup failed in stress test");
        }
        await chrome.tabs.group({ tabIds: [tabA.id, tabB.id] });
      }, { titleA: "Stress Sync E", titleB: "Stress Sync F" });
      await assertSyncInvariants();

      await sidePanelPage.evaluate(async ({ parentTitle, childTitles }) => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const parent = tabs.find((tab) => tab.title === parentTitle);
        const children = childTitles
          .map((title) => tabs.find((tab) => tab.title === title))
          .filter(Boolean);
        if (!parent || children.length !== childTitles.length) {
          throw new Error("Batch reparent setup failed in stress test");
        }
        await chrome.runtime.sendMessage({
          type: "TREE_ACTION",
          payload: {
            type: "BATCH_REPARENT",
            tabIds: children.map((tab) => tab.id),
            newParentTabId: parent.id,
            targetTabId: parent.id,
            placement: "inside"
          }
        });
      }, {
        parentTitle: "Stress Sync B",
        childTitles: ["Stress Sync C", "Stress Sync D"]
      });
      await assertSyncInvariants();

      await sidePanelPage.evaluate(async ({ anchorTitle, movingTitles }) => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const anchor = tabs.find((tab) => tab.title === anchorTitle);
        const moving = movingTitles
          .map((title) => tabs.find((tab) => tab.title === title))
          .filter(Boolean);
        if (!anchor || moving.length !== movingTitles.length) {
          throw new Error("Batch move-to-root setup failed in stress test");
        }
        await chrome.runtime.sendMessage({
          type: "TREE_ACTION",
          payload: {
            type: "BATCH_MOVE_TO_ROOT",
            tabIds: moving.map((tab) => tab.id),
            targetTabId: anchor.id,
            placement: "after"
          }
        });
      }, {
        anchorTitle: "Stress Sync A",
        movingTitles: ["Stress Sync C", "Stress Sync D"]
      });
      await assertSyncInvariants();

      await sidePanelPage.evaluate(async ({ moveTitle, anchorTitle }) => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const moveTab = tabs.find((tab) => tab.title === moveTitle);
        const anchorTab = tabs.find((tab) => tab.title === anchorTitle);
        if (!moveTab || !anchorTab) {
          throw new Error("Native move setup failed in stress test");
        }
        await chrome.tabs.move(moveTab.id, { index: anchorTab.index });
      }, { moveTitle: "Stress Sync F", anchorTitle: "Stress Sync A" });
      await assertSyncInvariants();

      await sidePanelPage.evaluate(async (activeTitle) => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const tab = tabs.find((candidate) => candidate.title === activeTitle);
        if (!tab) {
          throw new Error("Activate setup failed in stress test");
        }
        await chrome.tabs.update(tab.id, { active: true });
      }, "Stress Sync D");
      await assertSyncInvariants();

      await sidePanelPage.evaluate(async (closeTitle) => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const tab = tabs.find((candidate) => candidate.title === closeTitle);
        if (!tab) {
          throw new Error("Close setup failed in stress test");
        }
        await chrome.tabs.remove(tab.id);
      }, "Stress Sync B");
      await assertSyncInvariants();
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("pinned strip shows count and exposes native pinned title tooltip", async ({ context, sidePanelPage }) => {
    const page = await createTitledTab(context, "Pinned Peek Tab");
    const tabId = await tabIdByTitle(sidePanelPage, "Pinned Peek Tab");
    expect(Number.isInteger(tabId)).toBeTruthy();

    await sidePanelPage.evaluate(async (id) => {
      await chrome.tabs.update(id, { pinned: true });
    }, tabId);

    const pinnedRow = sidePanelPage.locator('.pinned-track .tree-row[title="Pinned Peek Tab"]').first();
    await expect(pinnedRow).toBeVisible();
    await expect(sidePanelPage.locator(".section-title").filter({ hasText: "Pinned ·" }).first()).toBeVisible();
    await expect(pinnedRow).toHaveAttribute("title", "Pinned Peek Tab");
    await expect(pinnedRow.locator(".pinned-label-peek")).toHaveCount(0);

    await page.close().catch(() => {});
  });

  test("context menu uses searchable existing-group picker for many groups", async ({ context, sidePanelPage }) => {
    const seedTitles = Array.from({ length: 7 }, (_, index) => `Picker Seed ${index + 1}`);
    const pages = [];
    try {
      for (const title of seedTitles) {
        pages.push(await createTitledTab(context, title));
      }
      const targetTitle = "Picker Ungrouped";
      pages.push(await createTitledTab(context, targetTitle));

      const grouped = await sidePanelPage.evaluate(async ({ seedTitles, targetTitle }) => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const groupIdsByTitle = {};

        for (const [index, title] of seedTitles.entries()) {
          const tab = tabs.find((candidate) => candidate.title === title);
          if (!Number.isInteger(tab?.id)) {
            continue;
          }
          const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
          const groupTitle = `Picker Group ${index + 1}`;
          await chrome.tabGroups.update(groupId, { title: groupTitle });
          groupIdsByTitle[groupTitle] = groupId;
        }

        const targetTabId = tabs.find((candidate) => candidate.title === targetTitle)?.id ?? null;
        return { groupIdsByTitle, targetTabId };
      }, { seedTitles, targetTitle });

      expect(Number.isInteger(grouped.targetTabId)).toBeTruthy();
      const targetGroupTitle = "Picker Group 3";
      const targetGroupId = grouped.groupIdsByTitle[targetGroupTitle];
      expect(Number.isInteger(targetGroupId)).toBeTruthy();

      await expect.poll(async () => {
        const count = await sidePanelPage.locator(".group-header").count();
        return count;
      }).toBeGreaterThanOrEqual(7);

      const row = rowByTitle(sidePanelPage, targetTitle);
      await expect(row).toBeVisible();

      const groupSearchInput = sidePanelPage.locator("#context-menu .context-group-search-input").first();
      let opened = false;
      for (let attempt = 0; attempt < 6; attempt++) {
        await row.click({ button: "right" });
        try {
          await expect(groupSearchInput).toBeVisible({ timeout: 1200 });
          opened = true;
          break;
        } catch {
          await sidePanelPage.keyboard.press("Escape").catch(() => {});
          await sidePanelPage.waitForTimeout(80);
        }
      }

      expect(opened).toBeTruthy();
      await groupSearchInput.fill(targetGroupTitle, { timeout: 2000 });

      const targetGroupItem = sidePanelPage.locator(".context-group-item")
        .filter({ has: sidePanelPage.locator(".context-group-label", { hasText: targetGroupTitle }) })
        .first();
      await expect(targetGroupItem).toBeVisible();

      await expect.poll(async () => sidePanelPage.evaluate((groupId) =>
        !!document.querySelector(`.context-group-item[data-group-id="${groupId}"]`), targetGroupId)).toBeTruthy();

      await sidePanelPage.evaluate((groupId) => {
        const target = document.querySelector(`.context-group-item[data-group-id="${groupId}"]`);
        if (!(target instanceof HTMLElement)) {
          throw new Error("target group item not found");
        }
        target.click();
      }, targetGroupId);

      await expect.poll(async () => sidePanelPage.evaluate(async (tabId) => {
        const tab = await chrome.tabs.get(tabId);
        return tab.groupId;
      }, grouped.targetTabId)).toBe(targetGroupId);
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
    }
  });

  test("tab-row context menu can close selected tabs", async ({ context, sidePanelPage }) => {
    const tabA = await createTitledTab(context, "Ctx Close A");
    const tabB = await createTitledTab(context, "Ctx Close B");

    const rowA = rowByTitle(sidePanelPage, "Ctx Close A");
    const rowB = rowByTitle(sidePanelPage, "Ctx Close B");

    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    await rowA.click();
    await rowB.click({ modifiers: ["Shift"] });
    await rowB.click({ button: "right" });

    const closeSelected = sidePanelPage.locator('.context-menu-item[data-action="close-selected-tabs"]');
    await expect(closeSelected).toBeVisible();
    await closeSelected.click();

    const confirmClose = sidePanelPage.locator("#confirm-ok");
    if (await confirmClose.isVisible()) {
      await confirmClose.click();
    }

    await expect(rowA).toHaveCount(0);
    await expect(rowB).toHaveCount(0);

    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
  });

  test("batch close confirmation cancel keeps selected tabs open", async ({ context, sidePanelPage }) => {
    const tabA = await createTitledTab(context, "Ctx Cancel A");
    const tabB = await createTitledTab(context, "Ctx Cancel B");

    const rowA = rowByTitle(sidePanelPage, "Ctx Cancel A");
    const rowB = rowByTitle(sidePanelPage, "Ctx Cancel B");
    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    await rowA.click();
    await rowB.click({ modifiers: ["Shift"] });
    await rowB.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="close-selected-tabs"]').click();

    const confirmOverlay = sidePanelPage.locator("#confirm-overlay");
    await expect(confirmOverlay).toBeVisible();
    await sidePanelPage.locator("#confirm-cancel").click();
    await expect(confirmOverlay).toBeHidden();

    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
  });

  test("single close-selected action skips confirmation", async ({ context, sidePanelPage }) => {
    const tabA = await createTitledTab(context, "Ctx Single Close");
    const rowA = rowByTitle(sidePanelPage, "Ctx Single Close");
    await expect(rowA).toBeVisible();

    await rowA.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="close-selected-tabs"]').click();

    await expect(sidePanelPage.locator("#confirm-overlay")).toBeHidden();
    await expect(rowA).toHaveCount(0);

    await tabA.close().catch(() => {});
  });

  test("canceling subtree close leaves parent and child tabs intact", async ({ context, sidePanelPage }) => {
    const parent = await createTitledTab(context, "Subtree Cancel Parent");
    const child = await createTitledTab(context, "Subtree Cancel Child");
    const parentTabId = await tabIdByTitle(sidePanelPage, "Subtree Cancel Parent");
    const childTabId = await tabIdByTitle(sidePanelPage, "Subtree Cancel Child");
    expect(Number.isInteger(parentTabId)).toBeTruthy();
    expect(Number.isInteger(childTabId)).toBeTruthy();

    await sidePanelPage.evaluate(async ({ childTabId, parentTabId }) => {
      await chrome.runtime.sendMessage({
        type: "TREE_ACTION",
        payload: {
          type: "REPARENT_TAB",
          tabId: childTabId,
          newParentTabId: parentTabId
        }
      });
    }, { childTabId, parentTabId });

    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      return childTitles(tree, "Subtree Cancel Parent");
    }).toEqual(["Subtree Cancel Child"]);

    const parentRow = rowByTitle(sidePanelPage, "Subtree Cancel Parent");
    await parentRow.locator('[data-action="toggle-collapse"]').click();
    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      const parentNode = nodeByTitle(tree, "Subtree Cancel Parent");
      return !!parentNode?.collapsed;
    }).toBeTruthy();

    await parentRow.locator('[data-action="close-tab"]').click();
    await expect(sidePanelPage.locator("#confirm-overlay")).toBeVisible();
    await sidePanelPage.locator("#confirm-cancel").click();
    await expect(sidePanelPage.locator("#confirm-overlay")).toBeHidden();

    await expect(rowByTitle(sidePanelPage, "Subtree Cancel Parent")).toBeVisible();
    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      const childNode = nodeByTitle(tree, "Subtree Cancel Child");
      const parentNode = nodeByTitle(tree, "Subtree Cancel Parent");
      return !!childNode && !!parentNode && childNode.parentNodeId === parentNode.nodeId;
    }).toBeTruthy();

    await parent.close().catch(() => {});
    await child.close().catch(() => {});
  });

  test("batch close skips modal when confirmCloseBatch is disabled", async ({ context, sidePanelPage }) => {
    const tabA = await createTitledTab(context, "Ctx Skip Confirm A");
    const tabB = await createTitledTab(context, "Ctx Skip Confirm B");

    await sidePanelPage.evaluate(async () => {
      await chrome.runtime.sendMessage({
        type: "PATCH_SETTINGS",
        payload: {
          settingsPatch: {
            confirmCloseBatch: false
          }
        }
      });
    });

    await expect.poll(async () => sidePanelPage.evaluate(async () => {
      const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
      return !!response?.payload?.settings?.confirmCloseBatch;
    })).toBe(false);

    const rowA = rowByTitle(sidePanelPage, "Ctx Skip Confirm A");
    const rowB = rowByTitle(sidePanelPage, "Ctx Skip Confirm B");
    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    await rowA.click();
    await rowB.click({ modifiers: ["Shift"] });
    await rowB.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="close-selected-tabs"]').click();

    await expect(sidePanelPage.locator("#confirm-overlay")).toBeHidden();
    await expect(rowA).toHaveCount(0);
    await expect(rowB).toHaveCount(0);

    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
  });

  test("confirm skip checkbox disables future batch-close confirmations after accept", async ({ context, sidePanelPage }) => {
    const tabA = await createTitledTab(context, "Ctx Skip Persist A");
    const tabB = await createTitledTab(context, "Ctx Skip Persist B");

    const rowA = rowByTitle(sidePanelPage, "Ctx Skip Persist A");
    const rowB = rowByTitle(sidePanelPage, "Ctx Skip Persist B");
    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    await rowA.click();
    await rowB.click({ modifiers: ["Shift"] });
    await rowB.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="close-selected-tabs"]').click();

    const confirmOverlay = sidePanelPage.locator("#confirm-overlay");
    await expect(confirmOverlay).toBeVisible();
    await sidePanelPage.locator("#confirm-skip").check();
    await sidePanelPage.locator("#confirm-ok").click();

    await expect(rowA).toHaveCount(0);
    await expect(rowB).toHaveCount(0);

    await expect.poll(async () => sidePanelPage.evaluate(async () => {
      const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
      return response?.payload?.settings?.confirmCloseBatch ?? null;
    })).toBe(false);

    const tabC = await createTitledTab(context, "Ctx Skip Persist C");
    const tabD = await createTitledTab(context, "Ctx Skip Persist D");
    const rowC = rowByTitle(sidePanelPage, "Ctx Skip Persist C");
    const rowD = rowByTitle(sidePanelPage, "Ctx Skip Persist D");
    await expect(rowC).toBeVisible();
    await expect(rowD).toBeVisible();

    await rowC.click();
    await rowD.click({ modifiers: ["Shift"] });
    await rowD.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="close-selected-tabs"]').click();

    await expect(confirmOverlay).toBeHidden();
    await expect(rowC).toHaveCount(0);
    await expect(rowD).toHaveCount(0);

    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
    await tabC.close().catch(() => {});
    await tabD.close().catch(() => {});
  });

  test("canceling with skip checked does not persist confirm-close preference", async ({ context, sidePanelPage }) => {
    const tabA = await createTitledTab(context, "Ctx Skip Cancel A");
    const tabB = await createTitledTab(context, "Ctx Skip Cancel B");

    await sidePanelPage.evaluate(async () => {
      await chrome.runtime.sendMessage({
        type: "PATCH_SETTINGS",
        payload: {
          settingsPatch: {
            confirmCloseBatch: true
          }
        }
      });
    });

    const rowA = rowByTitle(sidePanelPage, "Ctx Skip Cancel A");
    const rowB = rowByTitle(sidePanelPage, "Ctx Skip Cancel B");
    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    await rowA.click();
    await rowB.click({ modifiers: ["Shift"] });
    await rowB.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="close-selected-tabs"]').click();

    const confirmOverlay = sidePanelPage.locator("#confirm-overlay");
    const confirmSkip = sidePanelPage.locator("#confirm-skip");
    await expect(confirmOverlay).toBeVisible();
    await confirmSkip.check();
    await sidePanelPage.locator("#confirm-cancel").click();
    await expect(confirmOverlay).toBeHidden();

    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    await rowA.click();
    await rowB.click({ modifiers: ["Shift"] });
    await rowB.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="close-selected-tabs"]').click();
    await expect(confirmOverlay).toBeVisible();
    await expect(confirmSkip).not.toBeChecked();
    await sidePanelPage.locator("#confirm-cancel").click();

    await expect.poll(async () => sidePanelPage.evaluate(async () => {
      const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
      return response?.payload?.settings?.confirmCloseBatch ?? null;
    })).toBe(true);

    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
  });

  test("keeps side panel tree scoped to its window", async ({ context, extensionId, sidePanelPage }) => {
    const sidePanelUrl = `chrome-extension://${extensionId}/sidepanel/index.html`;
    const windowOneTitle = "Window One Unique";
    const windowTwoTitle = "Window Two Unique";
    const windowTwoUpdateTitle = "Window Two Update";

    const windowOneId = await sidePanelPage.evaluate(async () => (await chrome.windows.getCurrent()).id);

    const pagePromise = context.waitForEvent("page");
    await sidePanelPage.evaluate(async (url) => {
      await chrome.windows.create({ url });
    }, sidePanelUrl);
    const sidePanelPageTwo = await pagePromise;
    await sidePanelPageTwo.waitForLoadState("domcontentloaded");

    const windowTwoId = await sidePanelPageTwo.evaluate(async () => (await chrome.windows.getCurrent()).id);
    expect(windowTwoId).not.toBe(windowOneId);

    await sidePanelPage.evaluate(async ({ windowId, title }) => {
      await chrome.tabs.create({
        windowId,
        url: `data:text/html,${encodeURIComponent(`<title>${title}</title><main>${title}</main>`)}`
      });
    }, { windowId: windowOneId, title: windowOneTitle });

    await sidePanelPageTwo.evaluate(async ({ windowId, title }) => {
      await chrome.tabs.create({
        windowId,
        url: `data:text/html,${encodeURIComponent(`<title>${title}</title><main>${title}</main>`)}`
      });
    }, { windowId: windowTwoId, title: windowTwoTitle });

    await expect(rowByTitle(sidePanelPage, windowOneTitle)).toBeVisible();
    await expect(rowByTitle(sidePanelPageTwo, windowTwoTitle)).toBeVisible();
    await expect(rowByTitle(sidePanelPage, windowTwoTitle)).toHaveCount(0);
    await expect(rowByTitle(sidePanelPageTwo, windowOneTitle)).toHaveCount(0);

    await sidePanelPageTwo.evaluate(async ({ windowId, title }) => {
      await chrome.tabs.create({
        windowId,
        url: `data:text/html,${encodeURIComponent(`<title>${title}</title><main>${title}</main>`)}`
      });
    }, { windowId: windowTwoId, title: windowTwoUpdateTitle });

    await expect(rowByTitle(sidePanelPageTwo, windowTwoUpdateTitle)).toBeVisible();
    await expect(rowByTitle(sidePanelPage, windowTwoUpdateTitle)).toHaveCount(0);

    await sidePanelPageTwo.close().catch(() => {});
  });

  test("group-header context menu can rename and recolor a group", async ({ context, sidePanelPage }) => {
    const tabA = await createTitledTab(context, "Ctx Group A");
    const tabB = await createTitledTab(context, "Ctx Group B");

    const rowA = rowByTitle(sidePanelPage, "Ctx Group A");
    const rowB = rowByTitle(sidePanelPage, "Ctx Group B");

    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    await rowA.click();
    await rowB.click({ modifiers: ["Shift"] });
    await rowA.click({ button: "right" });

    await sidePanelPage.locator('.context-menu-item[data-action="group-selected-new"]').click();

    const groupSection = sidePanelPage.locator(".group-section").filter({ has: rowA }).first();
    const groupHeader = groupSection.locator(".group-header");
    await expect(groupHeader).toBeVisible();

    await groupHeader.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="rename-group"]').click();

    const renameInput = sidePanelPage.locator(".context-rename-input");
    await expect(renameInput).toBeVisible();
    await renameInput.fill("Task Group 1");
    await renameInput.press("Enter");

    const renamedHeader = sidePanelPage
      .locator(".group-header")
      .filter({ has: sidePanelPage.locator(".group-name", { hasText: "Task Group 1" }) })
      .first();
    await expect(renamedHeader).toBeVisible();

    await renamedHeader.click({ button: "right" });
    const redColor = sidePanelPage.locator('.context-color-swatch[data-color="red"]');
    await expect(redColor).toBeVisible();
    await redColor.click();

    const renamedGroupId = Number(await renamedHeader.getAttribute("data-group-id"));
    expect(Number.isInteger(renamedGroupId)).toBeTruthy();

    await expect.poll(async () => {
      const colorDot = sidePanelPage
        .locator(".group-header")
        .filter({ has: sidePanelPage.locator(".group-name", { hasText: "Task Group 1" }) })
        .first()
        .locator(".group-color-dot");
      return colorDot.evaluate((el) => getComputedStyle(el).backgroundColor);
    }).toBe("rgb(228, 88, 88)");

    await expect.poll(async () => sidePanelPage.evaluate(async (groupId) => {
      const nativeGroup = await chrome.tabGroups.get(groupId);
      return nativeGroup?.color ?? null;
    }, renamedGroupId)).toBe("red");

    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
  });

  test("set-group-color action falls back to tabIds when groupId is stale", async ({ context, sidePanelPage }) => {
    const tabA = await createTitledTab(context, "Fallback Group A");
    const tabB = await createTitledTab(context, "Fallback Group B");

    const rowA = rowByTitle(sidePanelPage, "Fallback Group A");
    const rowB = rowByTitle(sidePanelPage, "Fallback Group B");

    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    await rowA.click();
    await rowB.click({ modifiers: ["Shift"] });
    await rowA.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="group-selected-new"]').click();

    const groupHeader = sidePanelPage.locator(".group-section").filter({ has: rowA }).first().locator(".group-header");
    await expect(groupHeader).toBeVisible();

    const groupId = Number(await groupHeader.getAttribute("data-group-id"));
    expect(Number.isInteger(groupId)).toBeTruthy();

    const tabIds = await sidePanelPage.evaluate(async ({ firstTitle, secondTitle }) => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      return tabs
        .filter((tab) => tab.title === firstTitle || tab.title === secondTitle)
        .map((tab) => tab.id)
        .filter((tabId) => Number.isInteger(tabId));
    }, { firstTitle: "Fallback Group A", secondTitle: "Fallback Group B" });
    expect(tabIds.length).toBe(2);

    const response = await sidePanelPage.evaluate(async ({ staleGroupId, tabIds: ids }) =>
      chrome.runtime.sendMessage({
        type: "TREE_ACTION",
        payload: {
          type: "SET_GROUP_COLOR",
          groupId: staleGroupId,
          color: "cyan",
          tabIds: ids
        }
      }), { staleGroupId: groupId + 1000000, tabIds });
    expect(response?.ok).toBeTruthy();

    await expect.poll(async () => sidePanelPage.evaluate(async (liveGroupId) => {
      const nativeGroup = await chrome.tabGroups.get(liveGroupId);
      return nativeGroup?.color ?? null;
    }, groupId)).toBe("cyan");

    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
  });

  test("group recolor can be changed multiple times and stays synced", async ({ context, sidePanelPage }) => {
    const tabA = await createTitledTab(context, "Multi Color A");
    const tabB = await createTitledTab(context, "Multi Color B");

    const rowA = rowByTitle(sidePanelPage, "Multi Color A");
    const rowB = rowByTitle(sidePanelPage, "Multi Color B");

    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    await rowA.click();
    await rowB.click({ modifiers: ["Shift"] });
    await rowA.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="group-selected-new"]').click();

    const groupHeader = sidePanelPage.locator(".group-section").filter({ has: rowA }).first().locator(".group-header");
    await expect(groupHeader).toBeVisible();

    const groupId = Number(await groupHeader.getAttribute("data-group-id"));
    expect(Number.isInteger(groupId)).toBeTruthy();

    const applyColorViaContextMenu = async (color) => {
      await groupHeader.click({ button: "right" });
      const colorButton = sidePanelPage.locator(`.context-color-swatch[data-color="${color}"]`);
      await expect(colorButton).toBeVisible();
      await colorButton.click();
    };

    await applyColorViaContextMenu("blue");

    await expect.poll(async () => sidePanelPage.evaluate(async (id) => {
      const group = await chrome.tabGroups.get(id);
      return group?.color ?? null;
    }, groupId)).toBe("blue");

    await expect.poll(async () => groupHeader.locator(".group-color-dot")
      .evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(77, 138, 240)");

    await applyColorViaContextMenu("yellow");

    await expect.poll(async () => sidePanelPage.evaluate(async (id) => {
      const group = await chrome.tabGroups.get(id);
      return group?.color ?? null;
    }, groupId)).toBe("yellow");

    await expect.poll(async () => groupHeader.locator(".group-color-dot")
      .evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(217, 163, 22)");

    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
  });

  test("group color persists after side panel reload", async ({ context, sidePanelPage }) => {
    const tabA = await createTitledTab(context, "Persist Color A");
    const tabB = await createTitledTab(context, "Persist Color B");

    const rowA = rowByTitle(sidePanelPage, "Persist Color A");
    const rowB = rowByTitle(sidePanelPage, "Persist Color B");

    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    await rowA.click();
    await rowB.click({ modifiers: ["Shift"] });
    await rowA.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="group-selected-new"]').click();

    const groupHeader = sidePanelPage.locator(".group-section").filter({ has: rowA }).first().locator(".group-header");
    await expect(groupHeader).toBeVisible();

    const groupId = Number(await groupHeader.getAttribute("data-group-id"));
    expect(Number.isInteger(groupId)).toBeTruthy();

    await groupHeader.click({ button: "right" });
    const orangeColor = sidePanelPage.locator('.context-color-swatch[data-color="orange"]');
    await expect(orangeColor).toBeVisible();
    await orangeColor.click();

    await expect.poll(async () => sidePanelPage.evaluate(async (id) => {
      const group = await chrome.tabGroups.get(id);
      return group?.color ?? null;
    }, groupId)).toBe("orange");

    await sidePanelPage.reload();
    await expect(rowByTitle(sidePanelPage, "Persist Color A")).toBeVisible();

    const rehydratedHeader = sidePanelPage.locator(`.group-header[data-group-id="${groupId}"]`).first();
    await expect(rehydratedHeader).toBeVisible();

    await expect.poll(async () => rehydratedHeader.locator(".group-color-dot")
      .evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(220, 125, 45)");

    await expect.poll(async () => sidePanelPage.evaluate(async (id) => {
      const group = await chrome.tabGroups.get(id);
      return group?.color ?? null;
    }, groupId)).toBe("orange");

    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
  });

  test("tab context menu can add selected tabs to an existing tab group via inline list", async ({ context, sidePanelPage }) => {
    const seedA = await createTitledTab(context, "Existing Group Seed A");
    const seedB = await createTitledTab(context, "Existing Group Seed B");
    const moveA = await createTitledTab(context, "Move To Existing A");
    const moveB = await createTitledTab(context, "Move To Existing B");

    const seedRowA = rowByTitle(sidePanelPage, "Existing Group Seed A");
    const seedRowB = rowByTitle(sidePanelPage, "Existing Group Seed B");
    const moveRowA = rowByTitle(sidePanelPage, "Move To Existing A");
    const moveRowB = rowByTitle(sidePanelPage, "Move To Existing B");

    await expect(seedRowA).toBeVisible();
    await expect(seedRowB).toBeVisible();
    await expect(moveRowA).toBeVisible();
    await expect(moveRowB).toBeVisible();

    await seedRowA.click();
    await seedRowB.click({ modifiers: ["Shift"] });
    await seedRowA.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="group-selected-new"]').click();

    const seedGroupHeader = sidePanelPage
      .locator(".group-section")
      .filter({ has: seedRowA })
      .first()
      .locator(".group-header");
    await expect(seedGroupHeader).toBeVisible();
    const targetGroupId = Number(await seedGroupHeader.getAttribute("data-group-id"));
    expect(Number.isInteger(targetGroupId)).toBeTruthy();

    await moveRowA.click();
    await moveRowB.click({ modifiers: ["Shift"] });
    await moveRowA.click({ button: "right" });

    const contextMenu = sidePanelPage.locator("#context-menu");
    await expect(contextMenu).toBeVisible();
    await expect(sidePanelPage.locator('.context-menu-item[data-action="group-selected-new"]')).toHaveText("Add to new tab group");

    await expect(contextMenu).toBeVisible();
    await sidePanelPage.locator(`.context-group-item[data-group-id="${targetGroupId}"]`).first().click();

    const windowId = await sidePanelPage.evaluate(async () => (await chrome.windows.getCurrent()).id);
    await expect.poll(async () => {
      return sidePanelPage.evaluate(async ({ windowId, targetGroupId }) => {
        const response = await chrome.runtime.sendMessage({
          type: "GET_STATE",
          payload: { windowId }
        });
        const windows = response?.payload?.windows || {};
        const tree = windows[windowId] || windows[String(windowId)] || null;
        if (!tree) {
          return null;
        }

        const nodes = Object.values(tree.nodes || {});
        const movedA = nodes.find((node) => (node.lastKnownTitle || "").includes("Move To Existing A")) || null;
        const movedB = nodes.find((node) => (node.lastKnownTitle || "").includes("Move To Existing B")) || null;
        return {
          movedAGroupId: movedA?.groupId ?? null,
          movedBGroupId: movedB?.groupId ?? null
        };
      }, { windowId, targetGroupId });
    }).toEqual({
      movedAGroupId: targetGroupId,
      movedBGroupId: targetGroupId
    });

    await seedA.close().catch(() => {});
    await seedB.close().catch(() => {});
    await moveA.close().catch(() => {});
    await moveB.close().catch(() => {});
  });

  test("dragging a group header before a row reorders the grouped block in UI", async ({ context, sidePanelPage }) => {
    const target = await createTitledTab(context, "UI Group Target");
    const tail = await createTitledTab(context, "UI Group Tail");
    const tabA = await createTitledTab(context, "UI Group Drag A");
    const tabB = await createTitledTab(context, "UI Group Drag B");

    const rowA = rowByTitle(sidePanelPage, "UI Group Drag A");
    const rowB = rowByTitle(sidePanelPage, "UI Group Drag B");
    const rowTarget = rowByTitle(sidePanelPage, "UI Group Target");
    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();
    await expect(rowTarget).toBeVisible();

    await rowA.click();
    await rowB.click({ modifiers: ["Shift"] });
    await rowA.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="group-selected-new"]').click();

    const groupHeader = groupHeaderByContainedRowTitle(sidePanelPage, "UI Group Drag A");
    await expect(groupHeader).toBeVisible();
    const sourceGroupId = Number(await groupHeader.getAttribute("data-group-id"));
    expect(Number.isInteger(sourceGroupId)).toBeTruthy();

    await dragGroupHeaderToRow(sidePanelPage, "UI Group Drag A", "UI Group Target", "before");

    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      const roots = rootTitles(tree).filter((title) => [
        "UI Group Drag A",
        "UI Group Drag B",
        "UI Group Target",
        "UI Group Tail"
      ].includes(title));
      const nodeA = nodeByTitle(tree, "UI Group Drag A");
      const nodeB = nodeByTitle(tree, "UI Group Drag B");
      return {
        roots,
        grouped: nodeA?.groupId === sourceGroupId && nodeB?.groupId === sourceGroupId
      };
    }).toEqual({
      roots: [
        "UI Group Drag A",
        "UI Group Drag B",
        "UI Group Target",
        "UI Group Tail"
      ],
      grouped: true
    });

    await target.close().catch(() => {});
    await tail.close().catch(() => {});
    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
  });

  test("moving a two-tab group keeps both tabs visible in side panel", async ({ context, sidePanelPage }) => {
    const tabA = await createTitledTab(context, "Move Group A");
    const tabB = await createTitledTab(context, "Move Group B");
    const tabC = await createTitledTab(context, "Move Group Target");

    const rowA = rowByTitle(sidePanelPage, "Move Group A");
    const rowB = rowByTitle(sidePanelPage, "Move Group B");
    const rowC = rowByTitle(sidePanelPage, "Move Group Target");

    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();
    await expect(rowC).toBeVisible();

    await rowA.click();
    await rowB.click({ modifiers: ["Shift"] });
    await rowA.click({ button: "right" });
    await sidePanelPage.locator('.context-menu-item[data-action="group-selected-new"]').click();

    const groupSection = sidePanelPage.locator(".group-section").filter({ has: rowA }).first();
    const groupHeader = groupSection.locator(".group-header");
    await expect(groupHeader).toBeVisible();

    const sourceGroupId = Number(await groupHeader.getAttribute("data-group-id"));
    const targetTabId = Number(await rowC.getAttribute("data-tab-id"));
    const windowId = await sidePanelPage.evaluate(async () => (await chrome.windows.getCurrent()).id);

    await sidePanelPage.evaluate(async ({ sourceGroupId, targetTabId, windowId }) => {
      await chrome.runtime.sendMessage({
        type: "TREE_ACTION",
        payload: {
          type: "MOVE_GROUP_BLOCK",
          sourceGroupId,
          targetTabId,
          position: "before",
          windowId
        }
      });
    }, { sourceGroupId, targetTabId, windowId });

    const movedGroupSection = sidePanelPage
      .locator(".group-section")
      .filter({ has: sidePanelPage.locator(`.group-header[data-group-id="${sourceGroupId}"]`) })
      .first();

    await expect(movedGroupSection).toBeVisible();
    await expect.poll(async () => {
      const summary = await sidePanelPage.evaluate(async ({ windowId, sourceGroupId, titleA, titleB }) => {
        const response = await chrome.runtime.sendMessage({
          type: "GET_STATE",
          payload: { windowId }
        });
        const windows = response?.payload?.windows || {};
        const tree = windows[windowId] || windows[String(windowId)] || null;
        if (!tree) {
          return null;
        }

        const nodes = Object.values(tree.nodes || {});
        const matchByTitle = (title) => nodes.find((node) => (node.lastKnownTitle || "").includes(title)) || null;
        const nodeA = matchByTitle(titleA);
        const nodeB = matchByTitle(titleB);

        return {
          nodeAInTree: !!nodeA,
          nodeBInTree: !!nodeB,
          nodeAGroupId: nodeA?.groupId ?? null,
          nodeBGroupId: nodeB?.groupId ?? null,
          groupedCount: nodes.filter((node) => node.groupId === sourceGroupId).length
        };
      }, {
        windowId,
        sourceGroupId,
        titleA: "Move Group A",
        titleB: "Move Group B"
      });

      return summary;
    }, { timeout: 10000 }).toEqual({
      nodeAInTree: true,
      nodeBInTree: true,
      nodeAGroupId: sourceGroupId,
      nodeBGroupId: sourceGroupId,
      groupedCount: 2
    });

    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
    await tabC.close().catch(() => {});
  });

  test("single-tab inside drag keeps native order aligned for non-adjacent move", async ({ context, sidePanelPage }) => {
    const sourceTitle = "Order Align Source";
    const fillerTitle = "Order Align Filler";
    const targetTitle = "Order Align Target";
    const targetChildTitle = "Order Align Target Child";
    const tailTitle = "Order Align Tail";

    const source = await createTitledTab(context, sourceTitle);
    const filler = await createTitledTab(context, fillerTitle);
    const target = await createTitledTab(context, targetTitle);
    const targetChild = await createTitledTab(context, targetChildTitle);
    const tail = await createTitledTab(context, tailTitle);

    const sourceTabId = await tabIdByTitle(sidePanelPage, sourceTitle);
    const targetTabId = await tabIdByTitle(sidePanelPage, targetTitle);
    const targetChildTabId = await tabIdByTitle(sidePanelPage, targetChildTitle);
    expect(Number.isInteger(sourceTabId)).toBeTruthy();
    expect(Number.isInteger(targetTabId)).toBeTruthy();
    expect(Number.isInteger(targetChildTabId)).toBeTruthy();

    await sidePanelPage.evaluate(async ({ targetTabId, targetChildTabId }) => {
      await chrome.runtime.sendMessage({
        type: "TREE_ACTION",
        payload: {
          type: "REPARENT_TAB",
          tabId: targetChildTabId,
          newParentTabId: targetTabId
        }
      });
    }, { targetTabId, targetChildTabId });

    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      return childTitles(tree, targetTitle);
    }).toEqual([targetChildTitle]);

    await dragRowToRow(sidePanelPage, sourceTitle, targetTitle, "inside");

    const trackedTitles = [fillerTitle, targetTitle, targetChildTitle, sourceTitle, tailTitle];
    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      const nativeOrder = await sidePanelPage.evaluate(async (titles) => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        return tabs
          .sort((a, b) => a.index - b.index)
          .map((tab) => tab.title || "")
          .filter((title) => titles.includes(title));
      }, trackedTitles);
      return {
        childOrder: childTitles(tree, targetTitle),
        nativeOrder
      };
    }).toEqual({
      childOrder: [targetChildTitle, sourceTitle],
      nativeOrder: [fillerTitle, targetTitle, targetChildTitle, sourceTitle, tailTitle]
    });

    await source.close().catch(() => {});
    await filler.close().catch(() => {});
    await target.close().catch(() => {});
    await targetChild.close().catch(() => {});
    await tail.close().catch(() => {});
  });

  test("multiselect drag inside reparents as ordered children", async ({ context, sidePanelPage }) => {
    const parent = await createTitledTab(context, "Batch Inside Parent");
    const sourceA = await createTitledTab(context, "Batch Inside Source A");
    const sourceB = await createTitledTab(context, "Batch Inside Source B");
    const target = await createTitledTab(context, "Batch Inside Target");

    const rowSourceA = rowByTitle(sidePanelPage, "Batch Inside Source A");
    const rowSourceB = rowByTitle(sidePanelPage, "Batch Inside Source B");

    await expect(rowSourceA).toBeVisible();
    await expect(rowSourceB).toBeVisible();

    await rowSourceA.click();
    await rowSourceB.click({ modifiers: ["Shift"] });
    await dragRowToRow(sidePanelPage, "Batch Inside Source A", "Batch Inside Target", "inside");

    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      return childTitles(tree, "Batch Inside Target");
    }).toEqual(["Batch Inside Source A", "Batch Inside Source B"]);

    await expectTreeAndNativeOrderMatch(
      sidePanelPage,
      ["Batch Inside Parent", "Batch Inside Target", "Batch Inside Source A", "Batch Inside Source B"],
      ["Batch Inside Parent", "Batch Inside Target", "Batch Inside Source A", "Batch Inside Source B"]
    );

    await parent.close().catch(() => {});
    await sourceA.close().catch(() => {});
    await sourceB.close().catch(() => {});
    await target.close().catch(() => {});
  });

  test("multiselect drag before inserts ordered block before target", async ({ context, sidePanelPage }) => {
    const target = await createTitledTab(context, "Batch Before Target");
    const tail = await createTitledTab(context, "Batch Before Tail");
    const sourceA = await createTitledTab(context, "Batch Before Source A");
    const sourceB = await createTitledTab(context, "Batch Before Source B");

    const rowSourceA = rowByTitle(sidePanelPage, "Batch Before Source A");
    const rowSourceB = rowByTitle(sidePanelPage, "Batch Before Source B");
    await expect(rowSourceA).toBeVisible();
    await expect(rowSourceB).toBeVisible();

    await rowSourceA.click();
    await rowSourceB.click({ modifiers: ["Shift"] });
    await dragRowToRow(sidePanelPage, "Batch Before Source A", "Batch Before Target", "before");

    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      return rootTitles(tree).filter((title) => [
        "Batch Before Source A",
        "Batch Before Source B",
        "Batch Before Target",
        "Batch Before Tail"
      ].includes(title));
    }).toEqual([
      "Batch Before Source A",
      "Batch Before Source B",
      "Batch Before Target",
      "Batch Before Tail"
    ]);

    await expectTreeAndNativeOrderMatch(
      sidePanelPage,
      ["Batch Before Source A", "Batch Before Source B", "Batch Before Target", "Batch Before Tail"],
      ["Batch Before Source A", "Batch Before Source B", "Batch Before Target", "Batch Before Tail"]
    );

    await target.close().catch(() => {});
    await tail.close().catch(() => {});
    await sourceA.close().catch(() => {});
    await sourceB.close().catch(() => {});
  });

  test("multiselect drag after inserts ordered block after target", async ({ context, sidePanelPage }) => {
    const sourceA = await createTitledTab(context, "Batch After Source A");
    const sourceB = await createTitledTab(context, "Batch After Source B");
    const target = await createTitledTab(context, "Batch After Target");
    const tail = await createTitledTab(context, "Batch After Tail");

    const rowSourceA = rowByTitle(sidePanelPage, "Batch After Source A");
    const rowSourceB = rowByTitle(sidePanelPage, "Batch After Source B");
    await expect(rowSourceA).toBeVisible();
    await expect(rowSourceB).toBeVisible();

    await rowSourceA.click();
    await rowSourceB.click({ modifiers: ["Shift"] });
    await dragRowToRow(sidePanelPage, "Batch After Source A", "Batch After Target", "after");

    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      return rootTitles(tree).filter((title) => [
        "Batch After Target",
        "Batch After Source A",
        "Batch After Source B",
        "Batch After Tail"
      ].includes(title));
    }).toEqual([
      "Batch After Target",
      "Batch After Source A",
      "Batch After Source B",
      "Batch After Tail"
    ]);

    await expectTreeAndNativeOrderMatch(
      sidePanelPage,
      ["Batch After Target", "Batch After Source A", "Batch After Source B", "Batch After Tail"],
      ["Batch After Target", "Batch After Source A", "Batch After Source B", "Batch After Tail"]
    );

    await sourceA.close().catch(() => {});
    await sourceB.close().catch(() => {});
    await target.close().catch(() => {});
    await tail.close().catch(() => {});
  });

  test("keyboard shortcuts move selected block before/after/inside", async ({ context, sidePanelPage }) => {
    const root = await createTitledTab(context, "Keyboard Move Root");
    const sourceA = await createTitledTab(context, "Keyboard Move Source A");
    const sourceB = await createTitledTab(context, "Keyboard Move Source B");
    const target = await createTitledTab(context, "Keyboard Move Target");

    const rowSourceA = rowByTitle(sidePanelPage, "Keyboard Move Source A");
    const rowSourceB = rowByTitle(sidePanelPage, "Keyboard Move Source B");
    await expect(rowSourceA).toBeVisible();
    await expect(rowSourceB).toBeVisible();

    await rowSourceA.click();
    await rowSourceB.click({ modifiers: ["Shift"] });
    await rowSourceA.focus();
    await rowSourceA.press("Alt+Shift+ArrowDown");

    await expectTreeAndNativeOrderMatch(
      sidePanelPage,
      ["Keyboard Move Root", "Keyboard Move Target", "Keyboard Move Source A", "Keyboard Move Source B"],
      ["Keyboard Move Root", "Keyboard Move Target", "Keyboard Move Source A", "Keyboard Move Source B"]
    );

    await rowByTitle(sidePanelPage, "Keyboard Move Source A").focus();
    await rowByTitle(sidePanelPage, "Keyboard Move Source A").press("Alt+Shift+ArrowUp");
    await expectTreeAndNativeOrderMatch(
      sidePanelPage,
      ["Keyboard Move Root", "Keyboard Move Source A", "Keyboard Move Source B", "Keyboard Move Target"],
      ["Keyboard Move Root", "Keyboard Move Source A", "Keyboard Move Source B", "Keyboard Move Target"]
    );

    await rowByTitle(sidePanelPage, "Keyboard Move Source A").focus();
    await sidePanelPage.evaluate((title) => {
      const rows = Array.from(document.querySelectorAll(".tree-row[data-tab-id]"));
      const row = rows.find((entry) => entry.querySelector(".title")?.textContent?.trim() === title);
      if (!row) {
        throw new Error("Keyboard move source row missing");
      }
      row.focus();
      row.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowRight",
        altKey: true,
        shiftKey: true,
        bubbles: true
      }));
    }, "Keyboard Move Source A");
    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      return {
        rootOrder: rootTitles(tree).filter((title) => [
          "Keyboard Move Root",
          "Keyboard Move Target",
          "Keyboard Move Source A",
          "Keyboard Move Source B"
        ].includes(title)),
        children: childTitles(tree, "Keyboard Move Root")
      };
    }).toEqual({
      rootOrder: ["Keyboard Move Root", "Keyboard Move Target"],
      children: ["Keyboard Move Source A", "Keyboard Move Source B"]
    });

    await expectTreeAndNativeOrderMatch(
      sidePanelPage,
      ["Keyboard Move Root", "Keyboard Move Source A", "Keyboard Move Source B", "Keyboard Move Target"],
      ["Keyboard Move Root", "Keyboard Move Source A", "Keyboard Move Source B", "Keyboard Move Target"]
    );

    await root.close().catch(() => {});
    await sourceA.close().catch(() => {});
    await sourceB.close().catch(() => {});
    await target.close().catch(() => {});
  });

  test("dragging an unselected row adopts dragged selection for quick back-and-forth moves", async ({ context, sidePanelPage }) => {
    const staleA = await createTitledTab(context, "Drag Select Stale A");
    const staleB = await createTitledTab(context, "Drag Select Stale B");
    const source = await createTitledTab(context, "Drag Select Source");
    const target = await createTitledTab(context, "Drag Select Target");

    const rowStaleA = rowByTitle(sidePanelPage, "Drag Select Stale A");
    const rowStaleB = rowByTitle(sidePanelPage, "Drag Select Stale B");
    await rowStaleA.click();
    await rowStaleB.click({ modifiers: ["Shift"] });

    await dragRowToRow(sidePanelPage, "Drag Select Source", "Drag Select Target", "after");
    await expectTreeAndNativeOrderMatch(
      sidePanelPage,
      ["Drag Select Stale A", "Drag Select Stale B", "Drag Select Target", "Drag Select Source"],
      ["Drag Select Stale A", "Drag Select Stale B", "Drag Select Target", "Drag Select Source"]
    );

    await expect.poll(async () => {
      return sidePanelPage.evaluate(() => {
        return Array.from(document.querySelectorAll(".tree-row.selected .title"))
          .map((el) => el.textContent?.trim() || "")
          .filter((title) => title.startsWith("Drag Select "));
      });
    }).toEqual(["Drag Select Source"]);

    await dragRowToRow(sidePanelPage, "Drag Select Source", "Drag Select Target", "before");
    await expectTreeAndNativeOrderMatch(
      sidePanelPage,
      ["Drag Select Stale A", "Drag Select Stale B", "Drag Select Source", "Drag Select Target"],
      ["Drag Select Stale A", "Drag Select Stale B", "Drag Select Source", "Drag Select Target"]
    );
    await expect.poll(async () => {
      return sidePanelPage.evaluate(() => {
        return Array.from(document.querySelectorAll(".tree-row.selected .title"))
          .map((el) => el.textContent?.trim() || "")
          .filter((title) => title.startsWith("Drag Select "));
      });
    }).toEqual(["Drag Select Source"]);

    await staleA.close().catch(() => {});
    await staleB.close().catch(() => {});
    await source.close().catch(() => {});
    await target.close().catch(() => {});
  });

  test("multiselect drop on search row moves ordered block to root end", async ({ context, sidePanelPage }) => {
    const parent = await createTitledTab(context, "Batch Root Parent");
    const sourceA = await createTitledTab(context, "Batch Root Source A");
    const sourceB = await createTitledTab(context, "Batch Root Source B");
    const tail = await createTitledTab(context, "Batch Root Tail");

    const parentTabId = await tabIdByTitle(sidePanelPage, "Batch Root Parent");
    const sourceATabId = await tabIdByTitle(sidePanelPage, "Batch Root Source A");
    const sourceBTabId = await tabIdByTitle(sidePanelPage, "Batch Root Source B");
    expect(Number.isInteger(parentTabId)).toBeTruthy();
    expect(Number.isInteger(sourceATabId)).toBeTruthy();
    expect(Number.isInteger(sourceBTabId)).toBeTruthy();

    await sidePanelPage.evaluate(async ({ parentTabId, sourceATabId, sourceBTabId }) => {
      await chrome.runtime.sendMessage({
        type: "TREE_ACTION",
        payload: {
          type: "REPARENT_TAB",
          tabId: sourceATabId,
          newParentTabId: parentTabId
        }
      });
      await chrome.runtime.sendMessage({
        type: "TREE_ACTION",
        payload: {
          type: "REPARENT_TAB",
          tabId: sourceBTabId,
          newParentTabId: parentTabId
        }
      });
    }, { parentTabId, sourceATabId, sourceBTabId });

    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      return childTitles(tree, "Batch Root Parent");
    }).toEqual(["Batch Root Source A", "Batch Root Source B"]);

    const rowSourceA = rowByTitle(sidePanelPage, "Batch Root Source A");
    const rowSourceB = rowByTitle(sidePanelPage, "Batch Root Source B");
    await rowSourceA.click();
    await rowSourceB.click({ modifiers: ["Shift"] });
    await dragRowToSearchRoot(sidePanelPage, "Batch Root Source A");

    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      const roots = rootTitles(tree);
      const tailIndex = roots.indexOf("Batch Root Tail");
      const sourceAIndex = roots.indexOf("Batch Root Source A");
      const sourceBIndex = roots.indexOf("Batch Root Source B");
      return {
        parentChildren: childTitles(tree, "Batch Root Parent"),
        endsWithDraggedBlock: roots.slice(-2).join("|") === "Batch Root Source A|Batch Root Source B",
        orderedAfterTail: tailIndex >= 0 && tailIndex < sourceAIndex && sourceAIndex < sourceBIndex
      };
    }).toEqual({
      parentChildren: [],
      endsWithDraggedBlock: true,
      orderedAfterTail: true
    });

    await expectTreeAndNativeOrderMatch(
      sidePanelPage,
      ["Batch Root Parent", "Batch Root Tail", "Batch Root Source A", "Batch Root Source B"],
      ["Batch Root Parent", "Batch Root Tail", "Batch Root Source A", "Batch Root Source B"]
    );

    await parent.close().catch(() => {});
    await sourceA.close().catch(() => {});
    await sourceB.close().catch(() => {});
    await tail.close().catch(() => {});
  });

  test("move action updates order without rendering undo toast", async ({ context, sidePanelPage }) => {
    const source = await createTitledTab(context, "Undo Move Source");
    const target = await createTitledTab(context, "Undo Move Target");
    const tail = await createTitledTab(context, "Undo Move Tail");

    const tracked = ["Undo Move Source", "Undo Move Target", "Undo Move Tail"];
    await expectTreeAndNativeOrderMatch(sidePanelPage, tracked, tracked);

    await dragRowToRow(sidePanelPage, "Undo Move Source", "Undo Move Target", "after");
    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      return rootTitles(tree).filter((title) => tracked.includes(title));
    }).toEqual(["Undo Move Target", "Undo Move Source", "Undo Move Tail"]);

    await expect(sidePanelPage.locator("#undo-toast")).toHaveCount(0);
    await expectTreeAndNativeOrderMatch(
      sidePanelPage,
      tracked,
      ["Undo Move Target", "Undo Move Source", "Undo Move Tail"]
    );

    await source.close().catch(() => {});
    await target.close().catch(() => {});
    await tail.close().catch(() => {});
  });

  test("multiselect drop on bottom root zone moves ordered block to root end", async ({ context, sidePanelPage }) => {
    const parent = await createTitledTab(context, "Bottom Root Parent");
    const sourceA = await createTitledTab(context, "Bottom Root Source A");
    const sourceB = await createTitledTab(context, "Bottom Root Source B");
    const tail = await createTitledTab(context, "Bottom Root Tail");

    await sidePanelPage.evaluate(async () => {
      await chrome.runtime.sendMessage({
        type: "PATCH_SETTINGS",
        payload: {
          settingsPatch: { showBottomRootDropZone: true }
        }
      });
    });

    const parentTabId = await tabIdByTitle(sidePanelPage, "Bottom Root Parent");
    const sourceATabId = await tabIdByTitle(sidePanelPage, "Bottom Root Source A");
    const sourceBTabId = await tabIdByTitle(sidePanelPage, "Bottom Root Source B");
    expect(Number.isInteger(parentTabId)).toBeTruthy();
    expect(Number.isInteger(sourceATabId)).toBeTruthy();
    expect(Number.isInteger(sourceBTabId)).toBeTruthy();

    await sidePanelPage.evaluate(async ({ parentTabId, sourceATabId, sourceBTabId }) => {
      await chrome.runtime.sendMessage({
        type: "TREE_ACTION",
        payload: {
          type: "REPARENT_TAB",
          tabId: sourceATabId,
          newParentTabId: parentTabId
        }
      });
      await chrome.runtime.sendMessage({
        type: "TREE_ACTION",
        payload: {
          type: "REPARENT_TAB",
          tabId: sourceBTabId,
          newParentTabId: parentTabId
        }
      });
    }, { parentTabId, sourceATabId, sourceBTabId });

    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      return childTitles(tree, "Bottom Root Parent");
    }).toEqual(["Bottom Root Source A", "Bottom Root Source B"]);

    const rowSourceA = rowByTitle(sidePanelPage, "Bottom Root Source A");
    const rowSourceB = rowByTitle(sidePanelPage, "Bottom Root Source B");
    await rowSourceA.click();
    await rowSourceB.click({ modifiers: ["Shift"] });
    await dragRowToBottomRoot(sidePanelPage, "Bottom Root Source A");

    await expect.poll(async () => {
      const tree = await getCurrentWindowTree(sidePanelPage);
      const roots = rootTitles(tree);
      const tailIndex = roots.indexOf("Bottom Root Tail");
      const sourceAIndex = roots.indexOf("Bottom Root Source A");
      const sourceBIndex = roots.indexOf("Bottom Root Source B");
      return {
        parentChildren: childTitles(tree, "Bottom Root Parent"),
        endsWithDraggedBlock: roots.slice(-2).join("|") === "Bottom Root Source A|Bottom Root Source B",
        orderedAfterTail: tailIndex >= 0 && tailIndex < sourceAIndex && sourceAIndex < sourceBIndex
      };
    }).toEqual({
      parentChildren: [],
      endsWithDraggedBlock: true,
      orderedAfterTail: true
    });

    await expectTreeAndNativeOrderMatch(
      sidePanelPage,
      ["Bottom Root Parent", "Bottom Root Tail", "Bottom Root Source A", "Bottom Root Source B"],
      ["Bottom Root Parent", "Bottom Root Tail", "Bottom Root Source A", "Bottom Root Source B"]
    );

    await parent.close().catch(() => {});
    await sourceA.close().catch(() => {});
    await sourceB.close().catch(() => {});
    await tail.close().catch(() => {});
  });

  test("repeated back-and-forth subtree block moves stay stable on 100-tab trees", async ({ sidePanelPage }) => {
    const prefix = "E2E Stress Tab ";
    const total = 100;
    const parentTitles = [`${prefix}10`, `${prefix}11`, `${prefix}12`];
    const childTitlesByParent = new Map([
      [`${prefix}10`, `${prefix}30`],
      [`${prefix}11`, `${prefix}31`],
      [`${prefix}12`, `${prefix}32`]
    ]);
    const leftAnchor = `${prefix}6`;
    const rightAnchor = `${prefix}16`;

    try {
      await sidePanelPage.evaluate(async ({ prefix, total }) => {
        for (let i = 0; i < total; i += 1) {
          await chrome.tabs.create({
            active: false,
            url: `data:text/html,<title>${prefix}${i}</title><main>${i}</main>`
          });
        }
      }, { prefix, total });

      await expect.poll(async () => {
        const tree = await getCurrentWindowTree(sidePanelPage);
        return Object.values(tree?.nodes || {})
          .map((node) => node.lastKnownTitle || "")
          .filter((title) => title.startsWith(prefix)).length;
      }, { timeout: 30000 }).toBe(total);

      const tabIds = {};
      for (const title of [...parentTitles, ...childTitlesByParent.values()]) {
        tabIds[title] = await tabIdByTitle(sidePanelPage, title);
        expect(Number.isInteger(tabIds[title])).toBeTruthy();
      }

      await sidePanelPage.evaluate(async ({ tabIds, parentTitles, childEntries }) => {
        for (const [parentTitle, childTitle] of childEntries) {
          await chrome.runtime.sendMessage({
            type: "TREE_ACTION",
            payload: {
              type: "REPARENT_TAB",
              tabId: tabIds[childTitle],
              newParentTabId: tabIds[parentTitle]
            }
          });
        }
      }, {
        tabIds,
        parentTitles,
        childEntries: Array.from(childTitlesByParent.entries())
      });

      await expect.poll(async () => {
        const tree = await getCurrentWindowTree(sidePanelPage);
        return parentTitles.map((parentTitle) => ({
          parentTitle,
          children: childTitles(tree, parentTitle)
        }));
      }).toEqual(parentTitles.map((parentTitle) => ({
        parentTitle,
        children: [childTitlesByParent.get(parentTitle)]
      })));

      await sidePanelPage.evaluate(async ({ parentTitles, tabIds }) => {
        for (const parentTitle of parentTitles) {
          await chrome.runtime.sendMessage({
            type: "TREE_ACTION",
            payload: {
              type: "TOGGLE_COLLAPSE",
              tabId: tabIds[parentTitle]
            }
          });
        }
      }, { parentTitles, tabIds });

      const rowFirstParent = rowByTitle(sidePanelPage, parentTitles[0]);
      const rowLastParent = rowByTitle(sidePanelPage, parentTitles[2]);
      await rowFirstParent.click();
      await rowLastParent.click({ modifiers: ["Shift"] });

      const trackedRoots = [
        leftAnchor,
        rightAnchor,
        parentTitles[0],
        parentTitles[1],
        parentTitles[2]
      ];

      for (let cycle = 0; cycle < 3; cycle += 1) {
        await dragRowToRow(sidePanelPage, parentTitles[0], rightAnchor, "after");
        await expect.poll(async () => {
          const tree = await getCurrentWindowTree(sidePanelPage);
          const [treeOrder, nativeOrder] = await Promise.all([
            treeOrderByTitles(sidePanelPage, trackedRoots),
            nativeOrderByTitles(sidePanelPage, trackedRoots)
          ]);
          return {
            parentChildren: parentTitles.map((parentTitle) => childTitles(tree, parentTitle)),
            trackedOrderParity: JSON.stringify(treeOrder) === JSON.stringify(nativeOrder),
            trackedCountOk: treeOrder.length === trackedRoots.length
          };
        }).toEqual({
          parentChildren: parentTitles.map((parentTitle) => [childTitlesByParent.get(parentTitle)]),
          trackedOrderParity: true,
          trackedCountOk: true
        });

        await dragRowToRow(sidePanelPage, parentTitles[0], leftAnchor, "after");
        await expect.poll(async () => {
          const tree = await getCurrentWindowTree(sidePanelPage);
          const [treeOrder, nativeOrder] = await Promise.all([
            treeOrderByTitles(sidePanelPage, trackedRoots),
            nativeOrderByTitles(sidePanelPage, trackedRoots)
          ]);
          return {
            parentChildren: parentTitles.map((parentTitle) => childTitles(tree, parentTitle)),
            trackedOrderParity: JSON.stringify(treeOrder) === JSON.stringify(nativeOrder),
            trackedCountOk: treeOrder.length === trackedRoots.length
          };
        }).toEqual({
          parentChildren: parentTitles.map((parentTitle) => [childTitlesByParent.get(parentTitle)]),
          trackedOrderParity: true,
          trackedCountOk: true
        });
      }
    } finally {
      await closeTabsByPrefix(sidePanelPage, prefix);
    }
  });

  test("long trees activate virtualization and limit rendered rows", async ({ sidePanelPage }) => {
    const prefix = "E2E Virtual Row ";
    const total = 320;
    try {
      await sidePanelPage.evaluate(async ({ prefix, total }) => {
        for (let i = 0; i < total; i += 1) {
          await chrome.tabs.create({
            active: false,
            url: `data:text/html,<title>${prefix}${i}</title><main>${i}</main>`
          });
        }
      }, { prefix, total });

      await expect.poll(async () => {
        const tree = await getCurrentWindowTree(sidePanelPage);
        const titles = Object.values(tree?.nodes || {})
          .map((node) => node.lastKnownTitle || "")
          .filter((title) => title.startsWith(prefix));
        return titles.length;
      }, { timeout: 30000 }).toBe(total);

      await expect.poll(async () => {
        return sidePanelPage.evaluate((totalCount) => {
          const treeRoot = document.querySelector("#tree-root");
          const renderedRows = document.querySelectorAll(".tree-row[data-tab-id]").length;
          return {
            virtualized: treeRoot?.classList?.contains("virtualized") || false,
            renderedRowsLessThanTotal: renderedRows < totalCount
          };
        }, total);
      }, { timeout: 10000 }).toEqual({
        virtualized: true,
        renderedRowsLessThanTotal: true
      });

      const renderedRows = await sidePanelPage.evaluate(() => {
        return document.querySelectorAll(".tree-row[data-tab-id]").length;
      });
      expect(renderedRows).toBeLessThan(total);

      const sourceTitle = `${prefix}8`;
      const targetTitle = `${prefix}15`;
      const sourceRow = rowByTitle(sidePanelPage, sourceTitle);
      const targetRow = rowByTitle(sidePanelPage, targetTitle);
      await expect(sourceRow).toBeVisible();
      await expect(targetRow).toBeVisible();
      await sidePanelPage.evaluate(({ sourceTitle, targetTitle }) => {
        const rows = Array.from(document.querySelectorAll(".tree-row[data-tab-id]"));
        const findRow = (title) => rows.find((row) => row.querySelector(".title")?.textContent?.trim() === title);
        const source = findRow(sourceTitle);
        const target = findRow(targetTitle);
        if (!source || !target) {
          throw new Error("Could not resolve virtualized drag rows");
        }

        const targetRect = target.getBoundingClientRect();
        const dataTransfer = new DataTransfer();
        source.dispatchEvent(new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer
        }));
        target.dispatchEvent(new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientY: Math.floor(targetRect.top + 2)
        }));
      }, { sourceTitle, targetTitle });

      await expect.poll(async () => {
        return sidePanelPage.evaluate((title) => {
          const anchor = document.querySelector("#drag-anchor-chip");
          const text = anchor?.textContent || "";
          return {
            visible: !anchor?.hidden,
            containsTarget: text.includes(title)
          };
        }, targetTitle);
      }).toEqual({
        visible: true,
        containsTarget: true
      });

      await sidePanelPage.evaluate(() => {
        const treeRoot = document.querySelector("#tree-root");
        if (treeRoot) {
          treeRoot.scrollTop += 260;
        }
      });

      await expect.poll(async () => {
        return sidePanelPage.evaluate(() => {
          const anchor = document.querySelector("#drag-anchor-chip");
          return {
            visible: !anchor?.hidden,
            hasLabel: !!anchor?.textContent?.trim()
          };
        });
      }).toEqual({
        visible: true,
        hasLabel: true
      });

      await sidePanelPage.evaluate((sourceTitle) => {
        const rows = Array.from(document.querySelectorAll(".tree-row[data-tab-id]"));
        const source = rows.find((row) => row.querySelector(".title")?.textContent?.trim() === sourceTitle);
        if (!source) {
          return;
        }
        const dataTransfer = new DataTransfer();
        source.dispatchEvent(new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
          dataTransfer
        }));
      }, sourceTitle);
    } finally {
      await closeTabsByPrefix(sidePanelPage, prefix);
    }
  });
});
