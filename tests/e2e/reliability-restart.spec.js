import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { chromium, expect, test } from "@playwright/test";

const EXTENSION_PATH = path.resolve(process.cwd());

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

async function createTitledTab(context, title) {
  const page = await context.newPage();
  await page.goto(`data:text/html,${encodeURIComponent(`<title>${title}</title><main>${title}</main>`)}`);
  await expect.poll(() => page.title()).toBe(title);
  return page;
}

async function parentChildRelation(sidePanelPage, parentTitle, childTitle) {
  return sidePanelPage.evaluate(async ({ parentTitle, childTitle }) => {
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
      childParentNodeId: childNode?.parentNodeId ?? null,
      parentNodeId: parentNode?.nodeId ?? null
    };
  }, { parentTitle, childTitle });
}

test.describe("Reliability: restart", () => {
  test("restores parent-child relationship after restart under queued mutations", async () => {
    const userDataDir = mkdtempSync(path.join(os.tmpdir(), "tabtree-reliability-restart-"));
    const parentTitle = `Reliability Restart Parent ${Date.now()}`;
    const childTitle = `Reliability Restart Child ${Date.now()}`;

    let launchOne = null;
    let launchTwo = null;
    let parentPage = null;
    let childPage = null;

    try {
      launchOne = await launchExtensionContext(userDataDir);
      const { context, sidePanelPage } = launchOne;

      parentPage = await createTitledTab(context, parentTitle);
      childPage = await createTitledTab(context, childTitle);

      const ids = await sidePanelPage.evaluate(async ({ parentTitle, childTitle }) => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const findByTitle = (title) =>
          tabs.find((tab) => (tab.title || "").includes(title))?.id ?? null;
        return {
          childTabId: findByTitle(childTitle),
          parentTabId: findByTitle(parentTitle),
          windowId: (await chrome.windows.getCurrent()).id
        };
      }, { parentTitle, childTitle });
      expect(Number.isInteger(ids.parentTabId)).toBe(true);
      expect(Number.isInteger(ids.childTabId)).toBe(true);

      const reparentResponse = await sidePanelPage.evaluate(async ({ parentTabId, childTabId }) => {
        return chrome.runtime.sendMessage({
          type: "TREE_ACTION",
          payload: {
            type: "REPARENT_TAB",
            tabId: childTabId,
            newParentTabId: parentTabId
          }
        });
      }, ids);
      expect(reparentResponse?.ok).toBe(true);

      await expect.poll(async () => {
        return sidePanelPage.evaluate(async ({ windowId, parentTitle, childTitle }) => {
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
            childParentNodeId: childNode?.parentNodeId ?? null,
            parentNodeId: parentNode?.nodeId ?? null
          };
        }, {
          windowId: ids.windowId,
          parentTitle,
          childTitle
        });
      }, { timeout: 15000 }).toEqual({
        childParentNodeId: `tab:${ids.parentTabId}`,
        parentNodeId: `tab:${ids.parentTabId}`
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
          windowId: ids.windowId,
          parentTabId: ids.parentTabId,
          childTabId: ids.childTabId
        });
      }, { timeout: 15000 }).toEqual({ hasParent: true });

      await context.close();
      launchOne = null;

      launchTwo = await launchExtensionContext(userDataDir);
      const afterRestartPage = launchTwo.sidePanelPage;

      await expect.poll(async () => {
        return parentChildRelation(afterRestartPage, parentTitle, childTitle);
      }, { timeout: 15000 }).toMatchObject({
        childParentNodeId: expect.stringMatching(/^tab:\d+$/),
        parentNodeId: expect.stringMatching(/^tab:\d+$/)
      });

      const afterRestart = await parentChildRelation(afterRestartPage, parentTitle, childTitle);
      expect(afterRestart?.childParentNodeId).toBe(afterRestart?.parentNodeId);
    } finally {
      await parentPage?.close().catch(() => {});
      await childPage?.close().catch(() => {});
      await launchTwo?.context?.close().catch(() => {});
      await launchOne?.context?.close().catch(() => {});
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
