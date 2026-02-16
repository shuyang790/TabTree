import { expect, test } from "./extension.fixture.js";

test.describe("Hardening regressions", () => {
  test("search exposes explicit accessibility attributes and persistent root-drop guidance", async ({ sidePanelPage }) => {
    const search = sidePanelPage.locator("#search");
    const dropHint = sidePanelPage.locator("#search-drop-hint");

    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute("aria-label", /search/i);
    await expect(search).toHaveAttribute("aria-describedby", "search-drop-hint");
    await expect(dropHint).toBeVisible();
    await expect(dropHint).toContainText(/drag/i);
    await expect(dropHint).toHaveAttribute("data-drop-active", "false");
  });

  test("unknown tree action returns a structured error response", async ({ sidePanelPage }) => {
    const response = await sidePanelPage.evaluate(async () => {
      return chrome.runtime.sendMessage({
        type: "TREE_ACTION",
        payload: {
          type: "THIS_ACTION_DOES_NOT_EXIST"
        }
      });
    });

    expect(response?.ok).toBe(false);
    expect(response?.error || "").toContain("Unsupported tree action type");
  });

  test("advanced behavior settings remain collapsed by default and still persist changes", async ({ sidePanelPage }) => {
    await expect.poll(async () => {
      return sidePanelPage.evaluate(async () => {
        const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
        return response?.payload?.settings?.showDragStatusChip ?? null;
      });
    }).toBe(false);

    await sidePanelPage.locator("#open-settings").click();
    await expect(sidePanelPage.locator("#settings-panel")).toBeVisible();

    const advancedBehavior = sidePanelPage.locator("#behavior-advanced");
    const advancedSummary = advancedBehavior.locator("summary");
    const dragStatusCheckbox = advancedBehavior.locator('input[name="showDragStatusChip"]');

    await expect(advancedBehavior).not.toHaveAttribute("open", "");
    await advancedSummary.click();
    await expect(advancedBehavior).toHaveAttribute("open", "");
    await expect(dragStatusCheckbox).toBeVisible();

    await dragStatusCheckbox.check();

    await expect.poll(async () => {
      return sidePanelPage.evaluate(async () => {
        const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
        return response?.payload?.settings?.showDragStatusChip ?? null;
      });
    }).toBe(true);
  });
});
