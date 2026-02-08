import { mkdirSync } from "node:fs";
import path from "node:path";

import { MESSAGE_TYPES, TREE_ACTIONS } from "../../shared/constants.js";
import { expect, test } from "./extension.fixture.js";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/images");
const VIEWPORT = { width: 1200, height: 750 };

function rowByTitle(sidePanelPage, title) {
  return sidePanelPage
    .locator(".tree-row")
    .filter({ has: sidePanelPage.locator(".title", { hasText: title }) })
    .first();
}

async function createTitledTab(context, title, subtitle = "") {
  const page = await context.newPage();
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: ui-sans-serif, system-ui; padding: 40px; line-height: 1.45; }
          h1 { margin: 0 0 10px; font-size: 28px; }
          p { margin: 0; color: #444; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p>${subtitle || title}</p>
      </body>
    </html>
  `;

  await page.goto(`data:text/html,${encodeURIComponent(html)}`);
  await expect.poll(() => page.title()).toBe(title);
  return page;
}

async function applyTheme(sidePanelPage, { scheme, lightPreset, darkPreset, accentColor }) {
  await sidePanelPage.emulateMedia({ colorScheme: scheme });

  await sidePanelPage.evaluate(async ({ MESSAGE_TYPES, settingsPatch }) => {
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.PATCH_SETTINGS,
      payload: { settingsPatch }
    });
  }, {
    MESSAGE_TYPES,
    settingsPatch: {
      themePresetLight: lightPreset,
      themePresetDark: darkPreset,
      accentColor,
      density: "comfortable",
      showFavicons: false
    }
  });

  await expect.poll(() => sidePanelPage.locator("html").getAttribute("data-theme")).toBe(scheme);
}

async function applyScreenshotFrame(sidePanelPage, { shellWidth = 620 } = {}) {
  await sidePanelPage.evaluate(({ shellWidth }) => {
    const styleId = "__tabtree-readme-screenshot-style";
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.textContent = `
      body {
        justify-content: center !important;
        align-items: stretch !important;
        padding: 14px !important;
        gap: 0 !important;
      }

      .app-shell {
        width: ${shellWidth}px !important;
        max-width: ${shellWidth}px !important;
        border: 1px solid var(--border);
        border-radius: 14px;
        box-shadow: var(--shadow);
        overflow: hidden;
        background: var(--bg-elev);
      }
    `;
  }, { shellWidth });
}

async function mapTabIdsByTitle(sidePanelPage, titles) {
  const ids = await sidePanelPage.evaluate(async ({ titles }) => {
    const currentWindow = await chrome.windows.getCurrent();
    const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
    const idMap = {};

    for (const title of titles) {
      idMap[title] = tabs.find((tab) => tab.title === title)?.id ?? null;
    }

    return idMap;
  }, { titles });

  for (const title of titles) {
    expect(Number.isInteger(ids[title])).toBeTruthy();
  }

  return ids;
}

async function sendTreeAction(sidePanelPage, payload) {
  await sidePanelPage.evaluate(async ({ MESSAGE_TYPES, payload }) => {
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.TREE_ACTION,
      payload
    });
  }, { MESSAGE_TYPES, payload });
}

function screenshotPath(filename) {
  return path.join(SCREENSHOT_DIR, filename);
}

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.beforeEach(async ({ sidePanelPage }) => {
  await sidePanelPage.setViewportSize(VIEWPORT);
  await expect(sidePanelPage.locator("#tree-root")).toBeVisible();
});

test.describe("README screenshots", () => {
  test("captures tree overview in dark theme", async ({ context, sidePanelPage }) => {
    await applyTheme(sidePanelPage, {
      scheme: "dark",
      lightPreset: "everforest-light",
      darkPreset: "catppuccin-mocha",
      accentColor: "#8caaee"
    });
    await applyScreenshotFrame(sidePanelPage);

    const titles = [
      "Inbox",
      "Sprint Plan",
      "Implement Drag Logic",
      "Write Unit Tests",
      "Release Notes"
    ];

    for (const title of titles) {
      await createTitledTab(context, title, `TabTree sample content for ${title}`);
      await expect(rowByTitle(sidePanelPage, title)).toBeVisible();
    }

    const ids = await mapTabIdsByTitle(sidePanelPage, titles);

    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: ids["Implement Drag Logic"],
      newParentTabId: ids["Sprint Plan"]
    });

    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: ids["Write Unit Tests"],
      newParentTabId: ids["Implement Drag Logic"]
    });

    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: ids["Release Notes"],
      newParentTabId: ids["Sprint Plan"]
    });

    await sidePanelPage.evaluate(async ({ tabId }) => {
      await chrome.tabs.update(tabId, { pinned: true });
    }, { tabId: ids.Inbox });

    await expect(rowByTitle(sidePanelPage, "Sprint Plan")).toBeVisible();
    await expect(rowByTitle(sidePanelPage, "Implement Drag Logic")).toBeVisible();
    await expect(rowByTitle(sidePanelPage, "Write Unit Tests")).toBeVisible();

    await sidePanelPage.screenshot({ path: screenshotPath("01-tree-overview-dark.png") });
  });

  test("captures grouped tabs in light theme", async ({ context, sidePanelPage }) => {
    await applyTheme(sidePanelPage, {
      scheme: "light",
      lightPreset: "gruvbox-light",
      darkPreset: "catppuccin-mocha",
      accentColor: "#d65d0e"
    });
    await applyScreenshotFrame(sidePanelPage);

    const titles = [
      "Design Board",
      "Marketing Plan",
      "Roadmap Review",
      "Sprint Retrospective"
    ];

    for (const title of titles) {
      await createTitledTab(context, title, `TabTree sample content for ${title}`);
      await expect(rowByTitle(sidePanelPage, title)).toBeVisible();
    }

    const ids = await mapTabIdsByTitle(sidePanelPage, titles);
    const groupTabIds = [ids["Design Board"], ids["Marketing Plan"], ids["Roadmap Review"]];

    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.BATCH_GROUP_NEW,
      tabIds: groupTabIds
    });

    const groupHeader = sidePanelPage.locator(".group-header").first();
    await expect(groupHeader).toBeVisible();

    const groupId = Number(await groupHeader.getAttribute("data-group-id"));
    expect(Number.isInteger(groupId)).toBeTruthy();

    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.RENAME_GROUP,
      groupId,
      title: "Launch Prep"
    });

    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.SET_GROUP_COLOR,
      groupId,
      color: "orange"
    });

    const renamedHeader = sidePanelPage
      .locator(".group-header")
      .filter({ has: sidePanelPage.locator(".group-name", { hasText: "Launch Prep" }) })
      .first();

    await expect(renamedHeader).toBeVisible();

    await sidePanelPage.screenshot({ path: screenshotPath("02-groups-and-colors-light.png") });
  });

  test("captures multi-select and batch actions in dark theme", async ({ context, sidePanelPage }) => {
    await applyTheme(sidePanelPage, {
      scheme: "dark",
      lightPreset: "everforest-light",
      darkPreset: "catppuccin-macchiato",
      accentColor: "#8bd5ca"
    });
    await applyScreenshotFrame(sidePanelPage);

    const titles = [
      "Onboarding Checklist",
      "API Contract",
      "Regression Tests",
      "Deployment Notes"
    ];

    for (const title of titles) {
      await createTitledTab(context, title, `TabTree sample content for ${title}`);
      await expect(rowByTitle(sidePanelPage, title)).toBeVisible();
    }

    const rowA = rowByTitle(sidePanelPage, "Onboarding Checklist");
    const rowC = rowByTitle(sidePanelPage, "Regression Tests");

    await rowA.click();
    await rowC.click({ modifiers: ["Shift"] });

    await expect(sidePanelPage.locator("#batch-bar")).toBeVisible();
    await expect(sidePanelPage.locator("#batch-count")).toContainText("3");

    await rowC.click({ button: "right" });
    await expect(sidePanelPage.locator("#context-menu")).toBeVisible();

    await sidePanelPage.screenshot({ path: screenshotPath("03-multiselect-batch-dark.png") });
  });

  test("captures settings and theme controls in light theme", async ({ sidePanelPage }) => {
    await applyTheme(sidePanelPage, {
      scheme: "light",
      lightPreset: "everforest-light",
      darkPreset: "catppuccin-mocha",
      accentColor: "#7f9f7f"
    });
    await applyScreenshotFrame(sidePanelPage, { shellWidth: 470 });

    await sidePanelPage.locator("#open-settings").click();
    await expect(sidePanelPage.locator("#settings-panel")).toBeVisible();

    await sidePanelPage.locator('select[name="themePresetLight"]').selectOption("everforest-light");
    await sidePanelPage.locator('select[name="themePresetDark"]').selectOption("catppuccin-mocha");
    await sidePanelPage.locator('select[name="density"]').selectOption("cozy");
    await sidePanelPage.locator('input[name="fontScale"]').fill("1.1");

    await expect(sidePanelPage.locator('select[name="density"]')).toHaveValue("cozy");

    await sidePanelPage.screenshot({ path: screenshotPath("04-settings-theme-light.png") });
  });
});
