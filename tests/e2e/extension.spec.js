import { expect, test } from "./extension.fixture.js";

test.describe("TabTree extension", () => {
  test("loads side panel app shell", async ({ sidePanelPage }) => {
    await expect(sidePanelPage.getByText("TabTree", { exact: true })).toBeVisible();
    await expect(sidePanelPage.getByPlaceholder("Search tabs by title or URL")).toBeVisible();
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

    await sidePanelPage.getByRole("button", { name: "Add Child" }).click();

    await expect
      .poll(() => context.pages().length, { message: "Expected add-child to create a new tab" })
      .toBeGreaterThan(beforeCount);
  });
});
