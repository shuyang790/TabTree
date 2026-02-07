import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { chromium, expect, test as base } from "@playwright/test";

const EXTENSION_PATH = path.resolve(process.cwd());

export const test = base.extend({
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(path.join(os.tmpdir(), "tabtree-pw-"));

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: process.env.PW_HEADLESS === "1",
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`
      ]
    });

    try {
      await use(context);
    } finally {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    }
  },

  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker");
    }
    const extensionId = new URL(serviceWorker.url()).host;
    await use(extensionId);
  },

  sidePanelPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);
    await use(page);
    await page.close();
  }
});

export { expect };
