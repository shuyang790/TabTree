import { mkdirSync } from "node:fs";
import path from "node:path";

import { MESSAGE_TYPES, TREE_ACTIONS } from "../../shared/constants.js";
import { expect, test } from "./extension.fixture.js";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/images");
const VIEWPORT = { width: 1280, height: 800 };

const THEME_PROFILES = {
  base: {
    lightPreset: "base-light",
    darkPreset: "base-dark",
    accentColor: "#0b57d0"
  },
  tokyonight: {
    lightPreset: "tokyonight-day",
    darkPreset: "tokyonight-night",
    accentColor: "#7aa2f7"
  }
};

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
          body {
            font-family: "Avenir Next", "Segoe UI", sans-serif;
            padding: 40px;
            line-height: 1.45;
            background: linear-gradient(140deg, #f4f7ff 0%, #eef3ff 60%, #f8fbff 100%);
          }
          h1 { margin: 0 0 10px; font-size: 28px; letter-spacing: 0.01em; }
          p { margin: 0; color: #4f5b75; }
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

async function applyTheme(sidePanelPage, { profile, scheme, settingsPatch = {} }) {
  const theme = THEME_PROFILES[profile];
  if (!theme) {
    throw new Error(`Unknown theme profile: ${profile}`);
  }

  await sidePanelPage.emulateMedia({ colorScheme: scheme });

  await sidePanelPage.evaluate(async ({ MESSAGE_TYPES, settingsPatch }) => {
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.PATCH_SETTINGS,
      payload: { settingsPatch }
    });
  }, {
    MESSAGE_TYPES,
    settingsPatch: {
      themePresetLight: theme.lightPreset,
      themePresetDark: theme.darkPreset,
      accentColor: theme.accentColor,
      density: "comfortable",
      fontScale: 1,
      indentPx: 16,
      radiusPx: 10,
      showFavicons: false,
      ...settingsPatch
    }
  });

  await expect.poll(() => sidePanelPage.locator("html").getAttribute("data-theme")).toBe(scheme);
}

async function applyScreenshotFrame(sidePanelPage, { shellWidth = 760 } = {}) {
  await sidePanelPage.evaluate(({ shellWidth }) => {
    const styleId = "__tabtree-readme-screenshot-style";
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.textContent = `
      html,
      body {
        min-height: 100%;
      }

      body {
        justify-content: center !important;
        align-items: stretch !important;
        gap: 0 !important;
        padding: 24px !important;
        background:
          radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--accent), transparent 80%) 0%, transparent 44%),
          radial-gradient(circle at 82% 90%, color-mix(in srgb, var(--accent), transparent 86%) 0%, transparent 42%),
          linear-gradient(170deg, color-mix(in srgb, var(--bg), black 3%) 0%, color-mix(in srgb, var(--bg), white 1%) 100%) !important;
      }

      .app-shell {
        width: ${shellWidth}px !important;
        max-width: ${shellWidth}px !important;
        border: 1px solid color-mix(in srgb, var(--border), white 8%);
        border-radius: 18px;
        box-shadow:
          0 18px 40px color-mix(in srgb, var(--shadow), transparent 15%),
          0 0 0 1px color-mix(in srgb, var(--border), transparent 70%);
        overflow: hidden;
        background: color-mix(in srgb, var(--bg-elev), transparent 4%);
      }

      #tree-root,
      .settings-panel {
        backdrop-filter: saturate(1.05);
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
  const response = await sidePanelPage.evaluate(async ({ MESSAGE_TYPES, payload }) => {
    return chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.TREE_ACTION,
      payload
    });
  }, { MESSAGE_TYPES, payload });

  expect(response?.ok).toBe(true);
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
  test("captures overview workspace in base dark", async ({ context, sidePanelPage }) => {
    await applyTheme(sidePanelPage, {
      profile: "base",
      scheme: "dark"
    });
    await applyScreenshotFrame(sidePanelPage, { shellWidth: 790 });

    const titles = [
      "Inbox",
      "Planning Hub",
      "Sprint Board",
      "API Contracts",
      "QA Sweep",
      "Release Notes",
      "Incident Log"
    ];

    for (const title of titles) {
      await createTitledTab(context, title, `TabTree sample content for ${title}`);
      await expect(rowByTitle(sidePanelPage, title)).toBeVisible();
    }

    const ids = await mapTabIdsByTitle(sidePanelPage, titles);

    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: ids["Sprint Board"],
      newParentTabId: ids["Planning Hub"]
    });
    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: ids["API Contracts"],
      newParentTabId: ids["Sprint Board"]
    });
    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: ids["QA Sweep"],
      newParentTabId: ids["Sprint Board"]
    });
    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: ids["Release Notes"],
      newParentTabId: ids["Planning Hub"]
    });
    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: ids["Incident Log"],
      newParentTabId: ids["Release Notes"]
    });
    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.TOGGLE_COLLAPSE,
      tabId: ids["Release Notes"]
    });

    await sidePanelPage.evaluate(async ({ tabId }) => {
      await chrome.tabs.update(tabId, { pinned: true });
    }, { tabId: ids.Inbox });

    await expect(rowByTitle(sidePanelPage, "Planning Hub")).toBeVisible();
    await sidePanelPage.screenshot({ path: screenshotPath("01-overview-base-dark.png") });
  });

  test("captures grouping workflow in base light", async ({ context, sidePanelPage }) => {
    await applyTheme(sidePanelPage, {
      profile: "base",
      scheme: "light"
    });
    await applyScreenshotFrame(sidePanelPage, { shellWidth: 770 });

    const titles = [
      "Design Board",
      "Launch Brief",
      "Customer Interviews",
      "Roadmap Review",
      "Sprint Retro"
    ];

    for (const title of titles) {
      await createTitledTab(context, title, `TabTree sample content for ${title}`);
      await expect(rowByTitle(sidePanelPage, title)).toBeVisible();
    }

    const ids = await mapTabIdsByTitle(sidePanelPage, titles);

    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.BATCH_GROUP_NEW,
      tabIds: [ids["Design Board"], ids["Launch Brief"], ids["Customer Interviews"]]
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
      color: "blue"
    });

    await expect(
      sidePanelPage
        .locator(".group-header")
        .filter({ has: sidePanelPage.locator(".group-name", { hasText: "Launch Prep" }) })
        .first()
    ).toBeVisible();

    await sidePanelPage.screenshot({ path: screenshotPath("02-grouping-base-light.png") });
  });

  test("captures multi-select actions in base dark", async ({ context, sidePanelPage }) => {
    await applyTheme(sidePanelPage, {
      profile: "base",
      scheme: "dark",
      settingsPatch: {
        accentColor: "#7ea8ff"
      }
    });
    await applyScreenshotFrame(sidePanelPage, { shellWidth: 780 });

    const titles = [
      "Onboarding Checklist",
      "API Contract",
      "Regression Tests",
      "Release Candidate",
      "Deployment Notes"
    ];

    for (const title of titles) {
      await createTitledTab(context, title, `TabTree sample content for ${title}`);
      await expect(rowByTitle(sidePanelPage, title)).toBeVisible();
    }

    const rowFirst = rowByTitle(sidePanelPage, "Onboarding Checklist");
    const rowFourth = rowByTitle(sidePanelPage, "Release Candidate");

    await rowFirst.click();
    await rowFourth.click({ modifiers: ["Shift"] });
    await expect(rowFirst).toHaveClass(/selected/);
    await expect(rowFourth).toHaveClass(/selected/);

    await rowFourth.click({ button: "right" });
    await expect(sidePanelPage.locator("#context-menu")).toBeVisible();

    await sidePanelPage.screenshot({ path: screenshotPath("03-multiselect-base-dark.png") });
  });

  test("captures settings controls in base light", async ({ sidePanelPage }) => {
    await applyTheme(sidePanelPage, {
      profile: "base",
      scheme: "light"
    });
    await applyScreenshotFrame(sidePanelPage, { shellWidth: 560 });

    await sidePanelPage.locator("#open-settings").click();
    await expect(sidePanelPage.locator("#settings-panel")).toBeVisible();

    await sidePanelPage.locator('select[name="themePresetLight"]').selectOption("base-light");
    await sidePanelPage.locator('select[name="themePresetDark"]').selectOption("base-dark");
    await sidePanelPage.locator('select[name="density"]').selectOption("cozy");
    await sidePanelPage.locator("#appearance-advanced").evaluate((details) => {
      details.open = true;
    });
    await sidePanelPage.locator('input[name="fontScale"]').fill("1.1");

    await expect(sidePanelPage.locator('select[name="density"]')).toHaveValue("cozy");
    await sidePanelPage.screenshot({ path: screenshotPath("04-settings-base-light.png") });
  });

  test("captures tokyonight workspace", async ({ context, sidePanelPage }) => {
    await applyTheme(sidePanelPage, {
      profile: "tokyonight",
      scheme: "dark"
    });
    await applyScreenshotFrame(sidePanelPage, { shellWidth: 790 });

    const titles = [
      "Design Sync",
      "Sprint Plan",
      "Bug Bash",
      "CI Dashboard",
      "Release Brief",
      "Metrics Review"
    ];

    for (const title of titles) {
      await createTitledTab(context, title, `TabTree sample content for ${title}`);
      await expect(rowByTitle(sidePanelPage, title)).toBeVisible();
    }

    const ids = await mapTabIdsByTitle(sidePanelPage, titles);

    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: ids["Bug Bash"],
      newParentTabId: ids["Sprint Plan"]
    });
    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: ids["CI Dashboard"],
      newParentTabId: ids["Sprint Plan"]
    });
    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.BATCH_GROUP_NEW,
      tabIds: [ids["Release Brief"], ids["Metrics Review"]]
    });

    const groupHeader = sidePanelPage.locator(".group-header").first();
    await expect(groupHeader).toBeVisible();
    const groupId = Number(await groupHeader.getAttribute("data-group-id"));
    expect(Number.isInteger(groupId)).toBeTruthy();

    await sendTreeAction(sidePanelPage, {
      type: TREE_ACTIONS.SET_GROUP_COLOR,
      groupId,
      color: "cyan"
    });

    await sidePanelPage.screenshot({ path: screenshotPath("05-tokyonight-workspace.png") });
  });

  test("captures tokyonight settings", async ({ sidePanelPage }) => {
    await applyTheme(sidePanelPage, {
      profile: "tokyonight",
      scheme: "light",
      settingsPatch: {
        density: "cozy",
        radiusPx: 12
      }
    });
    await applyScreenshotFrame(sidePanelPage, { shellWidth: 580 });

    await sidePanelPage.locator("#open-settings").click();
    await expect(sidePanelPage.locator("#settings-panel")).toBeVisible();

    await sidePanelPage.locator('select[name="themePresetLight"]').selectOption("tokyonight-day");
    await sidePanelPage.locator('select[name="themePresetDark"]').selectOption("tokyonight-night");
    await sidePanelPage.locator('#settings-form input[name="accentColor"]').fill("#7aa2f7");
    await sidePanelPage.locator("#appearance-advanced").evaluate((details) => {
      details.open = true;
    });
    await sidePanelPage.locator('input[name="indentPx"]').fill("18");

    await expect(sidePanelPage.locator('select[name="themePresetLight"]')).toHaveValue("tokyonight-day");
    await expect(sidePanelPage.locator('select[name="themePresetDark"]')).toHaveValue("tokyonight-night");

    await sidePanelPage.screenshot({ path: screenshotPath("06-tokyonight-settings.png") });
  });
});
