import { expect, test } from "./extension.fixture.js";

async function createTitledTab(context, title) {
  const page = await context.newPage();
  await page.setContent(`<title>${title}</title><main>${title}</main>`);
  await expect.poll(() => page.title()).toBe(title);
  return page;
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

async function dragRowToRow(sidePanelPage, sourceTitle, targetTitle, position) {
  const source = rowByTitle(sidePanelPage, sourceTitle);
  const target = rowByTitle(sidePanelPage, targetTitle);
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

    await sourceA.close().catch(() => {});
    await sourceB.close().catch(() => {});
    await target.close().catch(() => {});
    await tail.close().catch(() => {});
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

    await parent.close().catch(() => {});
    await sourceA.close().catch(() => {});
    await sourceB.close().catch(() => {});
    await tail.close().catch(() => {});
  });
});
