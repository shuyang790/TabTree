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
    const seedTitles = Array.from({ length: 9 }, (_, index) => `Picker Seed ${index + 1}`);
    const pages = [];
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
      return count >= 7;
    }).toBeTruthy();

    const row = rowByTitle(sidePanelPage, targetTitle);
    await expect(row).toBeVisible();

    const groupSearchInput = sidePanelPage.locator(".context-group-search-input");
    let inputVisible = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await row.click({ button: "right" });
      if (await groupSearchInput.first().isVisible().catch(() => false)) {
        inputVisible = true;
        break;
      }
      await sidePanelPage.keyboard.press("Escape");
      await sidePanelPage.waitForTimeout(120);
    }

    expect(inputVisible).toBeTruthy();
    await groupSearchInput.fill(targetGroupTitle);

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

    for (const page of pages) {
      await page.close().catch(() => {});
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
});
