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

  test("add child action opens a new tab", async ({ context, sidePanelPage }) => {
    const beforeCount = context.pages().length;

    await sidePanelPage.locator("#add-child-global").click();

    await expect
      .poll(() => context.pages().length, { message: "Expected add-child to create a new tab" })
      .toBeGreaterThan(beforeCount);
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
    const colorTrigger = sidePanelPage.locator('.context-submenu-trigger[data-action="group-color"]');
    await expect(colorTrigger).toBeVisible();
    await colorTrigger.hover();
    await sidePanelPage.locator('.context-color-item[data-color="red"]').click();

    await expect.poll(async () => {
      const colorDot = sidePanelPage
        .locator(".group-header")
        .filter({ has: sidePanelPage.locator(".group-name", { hasText: "Task Group 1" }) })
        .first()
        .locator(".group-color-dot");
      return colorDot.evaluate((el) => getComputedStyle(el).backgroundColor);
    }).toBe("rgb(228, 88, 88)");

    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
  });
});
