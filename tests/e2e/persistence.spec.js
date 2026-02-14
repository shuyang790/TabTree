import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { chromium, expect, test } from "@playwright/test";

const EXTENSION_PATH = path.resolve(process.cwd());

function rowByTitle(sidePanelPage, title) {
  return sidePanelPage
    .locator(".tree-row")
    .filter({ has: sidePanelPage.locator(".title", { hasText: title }) })
    .first();
}

async function createTitledTab(context, title) {
  const page = await context.newPage();
  const html = `<title>${title}</title><main>${title}</main>`;
  await page.goto(`data:text/html,${encodeURIComponent(html)}`);
  await expect.poll(() => page.title()).toBe(title);
  return page;
}

async function createHashTitledTab(context, title) {
  const page = await context.newPage();
  const html = `
    <script>
      const title = decodeURIComponent(location.hash.slice(1) || "Untitled");
      document.title = title;
      document.body.textContent = title;
    </script>
  `;
  await page.goto(`data:text/html,${encodeURIComponent(html)}#${encodeURIComponent(title)}`);
  await expect.poll(() => page.title()).toBe(title);
  return page;
}

async function launchExtensionContext(userDataDir) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.PW_HEADLESS === "1",
    args: [
      "--restore-last-session",
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`
    ]
  });

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }
  const extensionId = new URL(serviceWorker.url()).host;
  const sidePanelPage = await context.newPage();
  await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);

  return { context, sidePanelPage };
}

test("restores parent-child tree relationship after browser restart", async () => {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "tabtree-persist-"));
  const parentTitle = `Restart Parent ${Date.now()}`;
  const childTitle = `Restart Child ${Date.now()}`;

  let launchOne = null;
  let launchTwo = null;

  try {
    launchOne = await launchExtensionContext(userDataDir);
    const { context, sidePanelPage } = launchOne;

    const parentTab = await createTitledTab(context, parentTitle);
    const childTab = await createTitledTab(context, childTitle);

    await expect(rowByTitle(sidePanelPage, parentTitle)).toBeVisible();
    await expect(rowByTitle(sidePanelPage, childTitle)).toBeVisible();

    const tabIds = await sidePanelPage.evaluate(async ({ parentTitle, childTitle }) => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const findByTitle = (title) =>
        tabs.find((tab) => (tab.title || "").includes(title))?.id ?? null;
      return {
        parentTabId: findByTitle(parentTitle),
        childTabId: findByTitle(childTitle),
        windowId: (await chrome.windows.getCurrent()).id
      };
    }, { parentTitle, childTitle });

    expect(Number.isInteger(tabIds.parentTabId)).toBeTruthy();
    expect(Number.isInteger(tabIds.childTabId)).toBeTruthy();
    expect(tabIds.parentTabId).not.toBe(tabIds.childTabId);

    await sidePanelPage.evaluate(async ({ parentTabId, childTabId }) => {
      await chrome.runtime.sendMessage({
        type: "TREE_ACTION",
        payload: {
          type: "REPARENT_TAB",
          tabId: childTabId,
          newParentTabId: parentTabId
        }
      });
    }, {
      parentTabId: tabIds.parentTabId,
      childTabId: tabIds.childTabId
    });

    await expect.poll(async () => {
      const summary = await sidePanelPage.evaluate(async ({ windowId, parentTitle, childTitle }) => {
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
        const parentNode = nodes.find((node) => (node.lastKnownTitle || "").includes(parentTitle)) || null;
        const childNode = nodes.find((node) => (node.lastKnownTitle || "").includes(childTitle)) || null;
        return {
          parentNodeId: parentNode?.nodeId ?? null,
          childParentNodeId: childNode?.parentNodeId ?? null
        };
      }, { windowId: tabIds.windowId, parentTitle, childTitle });

      return summary;
    }, { timeout: 10000 }).toEqual({
      parentNodeId: `tab:${tabIds.parentTabId}`,
      childParentNodeId: `tab:${tabIds.parentTabId}`
    });

    await expect.poll(async () => {
      return sidePanelPage.evaluate(async ({ windowId, parentTabId, childTabId }) => {
        const key = `tree.local.v1.${windowId}`;
        const raw = await chrome.storage.local.get([key]);
        const tree = raw[key] || null;
        if (!tree) {
          return null;
        }
        const childNode = tree.nodes?.[`tab:${childTabId}`] || null;
        return {
          hasParent: childNode?.parentNodeId === `tab:${parentTabId}`
        };
      }, {
        windowId: tabIds.windowId,
        parentTabId: tabIds.parentTabId,
        childTabId: tabIds.childTabId
      });
    }, { timeout: 10000 }).toEqual({ hasParent: true });

    await context.close();

    launchTwo = await launchExtensionContext(userDataDir);
    const sidePanelPageTwo = launchTwo.sidePanelPage;

    await expect(rowByTitle(sidePanelPageTwo, parentTitle)).toBeVisible();
    await expect(rowByTitle(sidePanelPageTwo, childTitle)).toBeVisible();

    await expect.poll(async () => {
      const summary = await sidePanelPageTwo.evaluate(async ({ parentTitle, childTitle }) => {
        const currentWindowId = (await chrome.windows.getCurrent()).id;
        const response = await chrome.runtime.sendMessage({
          type: "GET_STATE",
          payload: { windowId: currentWindowId }
        });
        const windows = response?.payload?.windows || {};
        const tree = windows[currentWindowId] || windows[String(currentWindowId)] || null;
        if (!tree) {
          return null;
        }
        const nodes = Object.values(tree.nodes || {});
        const parentNode = nodes.find((node) => (node.lastKnownTitle || "").includes(parentTitle)) || null;
        const childNode = nodes.find((node) => (node.lastKnownTitle || "").includes(childTitle)) || null;
        return {
          parentNodeId: parentNode?.nodeId ?? null,
          childParentNodeId: childNode?.parentNodeId ?? null
        };
      }, { parentTitle, childTitle });

      return summary;
    }, { timeout: 10000 }).toMatchObject({
      parentNodeId: expect.stringMatching(/^tab:\d+$/),
      childParentNodeId: expect.stringMatching(/^tab:\d+$/)
    });

    const restoredRelation = await sidePanelPageTwo.evaluate(async ({ parentTitle, childTitle }) => {
      const currentWindowId = (await chrome.windows.getCurrent()).id;
      const response = await chrome.runtime.sendMessage({
        type: "GET_STATE",
        payload: { windowId: currentWindowId }
      });
      const windows = response?.payload?.windows || {};
      const tree = windows[currentWindowId] || windows[String(currentWindowId)] || null;
      if (!tree) {
        return null;
      }
      const nodes = Object.values(tree.nodes || {});
      const parentNode = nodes.find((node) => (node.lastKnownTitle || "").includes(parentTitle)) || null;
      const childNode = nodes.find((node) => (node.lastKnownTitle || "").includes(childTitle)) || null;
      return {
        parentNodeId: parentNode?.nodeId ?? null,
        childParentNodeId: childNode?.parentNodeId ?? null
      };
    }, { parentTitle, childTitle });

    expect(restoredRelation?.parentNodeId).toBeTruthy();
    expect(restoredRelation?.childParentNodeId).toBe(restoredRelation?.parentNodeId);
  } finally {
    await launchTwo?.context?.close().catch(() => {});
    await launchOne?.context?.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("restores same-url siblings under original parent after browser restart", async () => {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "tabtree-persist-dup-url-"));
  const stamp = Date.now();
  const parentTitle = `Restart SameUrl Parent ${stamp}`;
  const childATitle = `Restart SameUrl Child A ${stamp}`;
  const childBTitle = `Restart SameUrl Child B ${stamp}`;

  let launchOne = null;
  let launchTwo = null;

  try {
    launchOne = await launchExtensionContext(userDataDir);
    const { context, sidePanelPage } = launchOne;

    await createHashTitledTab(context, parentTitle);
    await createHashTitledTab(context, childATitle);
    await createHashTitledTab(context, childBTitle);

    await expect(rowByTitle(sidePanelPage, parentTitle)).toBeVisible();
    await expect(rowByTitle(sidePanelPage, childATitle)).toBeVisible();
    await expect(rowByTitle(sidePanelPage, childBTitle)).toBeVisible();

    const tabIds = await sidePanelPage.evaluate(async ({ parentTitle, childATitle, childBTitle }) => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const findByTitle = (title) => tabs.find((tab) => (tab.title || "") === title)?.id ?? null;
      return {
        parentTabId: findByTitle(parentTitle),
        childATabId: findByTitle(childATitle),
        childBTabId: findByTitle(childBTitle),
        windowId: (await chrome.windows.getCurrent()).id
      };
    }, { parentTitle, childATitle, childBTitle });

    expect(Number.isInteger(tabIds.parentTabId)).toBeTruthy();
    expect(Number.isInteger(tabIds.childATabId)).toBeTruthy();
    expect(Number.isInteger(tabIds.childBTabId)).toBeTruthy();

    await sidePanelPage.evaluate(async ({ parentTabId, childATabId, childBTabId }) => {
      await chrome.runtime.sendMessage({
        type: "TREE_ACTION",
        payload: {
          type: "REPARENT_TAB",
          tabId: childATabId,
          newParentTabId: parentTabId
        }
      });
      await chrome.runtime.sendMessage({
        type: "TREE_ACTION",
        payload: {
          type: "REPARENT_TAB",
          tabId: childBTabId,
          newParentTabId: parentTabId
        }
      });
    }, {
      parentTabId: tabIds.parentTabId,
      childATabId: tabIds.childATabId,
      childBTabId: tabIds.childBTabId
    });

    await expect.poll(async () => {
      return sidePanelPage.evaluate(async ({ windowId, parentTitle, childATitle, childBTitle }) => {
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
        const parentNode = nodes.find((node) => node.lastKnownTitle === parentTitle) || null;
        const childA = nodes.find((node) => node.lastKnownTitle === childATitle) || null;
        const childB = nodes.find((node) => node.lastKnownTitle === childBTitle) || null;
        return {
          parentNodeId: parentNode?.nodeId ?? null,
          childAParentNodeId: childA?.parentNodeId ?? null,
          childBParentNodeId: childB?.parentNodeId ?? null
        };
      }, { windowId: tabIds.windowId, parentTitle, childATitle, childBTitle });
    }).toEqual({
      parentNodeId: `tab:${tabIds.parentTabId}`,
      childAParentNodeId: `tab:${tabIds.parentTabId}`,
      childBParentNodeId: `tab:${tabIds.parentTabId}`
    });

    await sidePanelPage.evaluate(async ({ parentTabId, childATabId, childBTabId }) => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const parent = tabs.find((tab) => tab.id === parentTabId);
      if (!parent) {
        throw new Error("parent tab missing");
      }
      await chrome.tabs.move(childATabId, { index: parent.index });
      const refreshed = await chrome.tabs.query({ currentWindow: true });
      const parentAfter = refreshed.find((tab) => tab.id === parentTabId);
      if (!parentAfter) {
        throw new Error("parent tab missing after first move");
      }
      await chrome.tabs.move(childBTabId, { index: parentAfter.index + 1 });
    }, {
      parentTabId: tabIds.parentTabId,
      childATabId: tabIds.childATabId,
      childBTabId: tabIds.childBTabId
    });

    await expect.poll(async () => sidePanelPage.evaluate(async ({ parentTitle, childATitle, childBTitle }) => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      return tabs
        .sort((a, b) => a.index - b.index)
        .map((tab) => tab.title || "")
        .filter((title) => title === parentTitle || title === childATitle || title === childBTitle);
    }, { parentTitle, childATitle, childBTitle })).toEqual([
      childATitle,
      parentTitle,
      childBTitle
    ]);

    await expect.poll(async () => {
      return sidePanelPage.evaluate(async ({ windowId, parentTabId, childATabId, childBTabId }) => {
        const key = `tree.local.v1.${windowId}`;
        const raw = await chrome.storage.local.get([key]);
        const tree = raw[key] || null;
        if (!tree) {
          return null;
        }
        return {
          childAParentNodeId: tree.nodes?.[`tab:${childATabId}`]?.parentNodeId ?? null,
          childBParentNodeId: tree.nodes?.[`tab:${childBTabId}`]?.parentNodeId ?? null
        };
      }, {
        windowId: tabIds.windowId,
        parentTabId: tabIds.parentTabId,
        childATabId: tabIds.childATabId,
        childBTabId: tabIds.childBTabId
      });
    }, { timeout: 10000 }).toEqual({
      childAParentNodeId: `tab:${tabIds.parentTabId}`,
      childBParentNodeId: `tab:${tabIds.parentTabId}`
    });

    await context.close();

    launchTwo = await launchExtensionContext(userDataDir);
    const sidePanelPageTwo = launchTwo.sidePanelPage;

    await expect(rowByTitle(sidePanelPageTwo, parentTitle)).toBeVisible();
    await expect(rowByTitle(sidePanelPageTwo, childATitle)).toBeVisible();
    await expect(rowByTitle(sidePanelPageTwo, childBTitle)).toBeVisible();

    await expect.poll(async () => {
      const summary = await sidePanelPageTwo.evaluate(async ({ parentTitle, childATitle, childBTitle }) => {
        const currentWindowId = (await chrome.windows.getCurrent()).id;
        const response = await chrome.runtime.sendMessage({
          type: "GET_STATE",
          payload: { windowId: currentWindowId }
        });
        const windows = response?.payload?.windows || {};
        const tree = windows[currentWindowId] || windows[String(currentWindowId)] || null;
        if (!tree) {
          return null;
        }
        const nodes = Object.values(tree.nodes || {});
        const parentNode = nodes.find((node) => node.lastKnownTitle === parentTitle) || null;
        const childA = nodes.find((node) => node.lastKnownTitle === childATitle) || null;
        const childB = nodes.find((node) => node.lastKnownTitle === childBTitle) || null;
        return {
          parentNodeId: parentNode?.nodeId ?? null,
          childAParentNodeId: childA?.parentNodeId ?? null,
          childBParentNodeId: childB?.parentNodeId ?? null
        };
      }, { parentTitle, childATitle, childBTitle });
      return summary;
    }, { timeout: 10000 }).toMatchObject({
      parentNodeId: expect.stringMatching(/^tab:\d+$/),
      childAParentNodeId: expect.stringMatching(/^tab:\d+$/),
      childBParentNodeId: expect.stringMatching(/^tab:\d+$/)
    });

    const restored = await sidePanelPageTwo.evaluate(async ({ parentTitle, childATitle, childBTitle }) => {
      const currentWindowId = (await chrome.windows.getCurrent()).id;
      const response = await chrome.runtime.sendMessage({
        type: "GET_STATE",
        payload: { windowId: currentWindowId }
      });
      const windows = response?.payload?.windows || {};
      const tree = windows[currentWindowId] || windows[String(currentWindowId)] || null;
      if (!tree) {
        return null;
      }
      const nodes = Object.values(tree.nodes || {});
      const parentNode = nodes.find((node) => node.lastKnownTitle === parentTitle) || null;
      const childA = nodes.find((node) => node.lastKnownTitle === childATitle) || null;
      const childB = nodes.find((node) => node.lastKnownTitle === childBTitle) || null;
      return {
        parentNodeId: parentNode?.nodeId ?? null,
        childAParentNodeId: childA?.parentNodeId ?? null,
        childBParentNodeId: childB?.parentNodeId ?? null
      };
    }, { parentTitle, childATitle, childBTitle });

    expect(restored?.parentNodeId).toBeTruthy();
    expect(restored?.childAParentNodeId).toBe(restored?.parentNodeId);
    expect(restored?.childBParentNodeId).toBe(restored?.parentNodeId);
  } finally {
    await launchTwo?.context?.close().catch(() => {});
    await launchOne?.context?.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
  }
});
