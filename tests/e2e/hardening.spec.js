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

  test("new theme families are available in both selectors and persist to settings", async ({ sidePanelPage }) => {
    const lightSelect = sidePanelPage.locator('select[name="themePresetLight"]');
    const darkSelect = sidePanelPage.locator('select[name="themePresetDark"]');
    const openSettings = sidePanelPage.locator("#open-settings");

    await openSettings.click();
    await expect(sidePanelPage.locator("#settings-panel")).toBeVisible();
    await expect(lightSelect).toBeVisible();
    await expect(darkSelect).toBeVisible();

    const expectedPresets = [
      "nord-light",
      "nord-dark",
      "solarized-light",
      "solarized-dark",
      "dracula-light",
      "dracula-dark"
    ];

    for (const preset of expectedPresets) {
      await expect(lightSelect.locator(`option[value=\"${preset}\"]`)).toHaveCount(1);
      await expect(darkSelect.locator(`option[value=\"${preset}\"]`)).toHaveCount(1);
    }

    await lightSelect.selectOption("solarized-light");
    await darkSelect.selectOption("dracula-dark");

    await expect.poll(async () => {
      return sidePanelPage.evaluate(async () => {
        const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
        return {
          light: response?.payload?.settings?.themePresetLight ?? null,
          dark: response?.payload?.settings?.themePresetDark ?? null
        };
      });
    }).toEqual({
      light: "solarized-light",
      dark: "dracula-dark"
    });
  });

  test("expanded locale catalogs are readable and keep key parity", async ({ sidePanelPage }) => {
    const summary = await sidePanelPage.evaluate(async () => {
      const localeIds = ["en", "zh_CN", "zh_TW", "es", "ja", "de", "fr"];
      const catalogs = {};
      for (const localeId of localeIds) {
        const url = chrome.runtime.getURL(`_locales/${localeId}/messages.json`);
        const response = await fetch(url);
        if (!response.ok) {
          catalogs[localeId] = { ok: false, keyCount: 0, nonEmptyCount: 0 };
          continue;
        }
        const json = await response.json();
        const keys = Object.keys(json);
        const nonEmptyCount = keys.filter((key) => typeof json[key]?.message === "string" && json[key].message.trim().length > 0).length;
        catalogs[localeId] = {
          ok: true,
          keyCount: keys.length,
          nonEmptyCount
        };
      }

      const baseCount = catalogs.en?.keyCount ?? 0;
      const parity = Object.fromEntries(localeIds.map((id) => [id, catalogs[id]?.keyCount === baseCount]));
      return { catalogs, parity, baseCount };
    });

    expect(summary.baseCount).toBeGreaterThan(0);
    for (const localeId of ["en", "zh_CN", "zh_TW", "es", "ja", "de", "fr"]) {
      expect(summary.catalogs[localeId]?.ok).toBe(true);
      expect(summary.catalogs[localeId]?.keyCount).toBe(summary.baseCount);
      expect(summary.catalogs[localeId]?.nonEmptyCount).toBe(summary.baseCount);
      expect(summary.parity[localeId]).toBe(true);
    }
  });
});
