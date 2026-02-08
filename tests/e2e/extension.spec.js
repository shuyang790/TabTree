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
    await expect(sidePanelPage.getByPlaceholder("Search tabs by title or URL")).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Settings" })).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Add child tab" })).toBeVisible();
    await expect(sidePanelPage.locator(".tree-root")).toBeVisible();
  });

  test("opens settings panel and persists a setting", async ({ sidePanelPage }) => {
    await sidePanelPage.getByRole("button", { name: "Settings" }).click();
    const densitySelect = sidePanelPage.locator('select[name="density"]');
    await expect(densitySelect).toBeVisible();

    await densitySelect.selectOption("compact");

    await sidePanelPage.reload();
    await sidePanelPage.getByRole("button", { name: "Settings" }).click();
    await expect(sidePanelPage.locator('select[name="density"]')).toHaveValue("compact");
  });

  test("add child action opens a new tab", async ({ context, sidePanelPage }) => {
    const beforeCount = context.pages().length;

    await sidePanelPage.getByRole("button", { name: "Add child tab" }).click();

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

    const closeSelected = sidePanelPage.getByRole("button", { name: /Close .*selected tab/i });
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

    await sidePanelPage.getByRole("button", { name: "Add selected to new tab group" }).click();

    const groupSection = sidePanelPage.locator(".group-section").filter({ has: rowA }).first();
    const groupHeader = groupSection.locator(".group-header");
    await expect(groupHeader).toBeVisible();

    await groupHeader.click({ button: "right" });
    await sidePanelPage.getByRole("button", { name: "Rename group..." }).click();

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
    const colorTrigger = sidePanelPage.getByRole("button", { name: "Color" });
    await expect(colorTrigger).toBeVisible();
    await colorTrigger.hover();
    await sidePanelPage.getByRole("button", { name: "Red" }).click();

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
