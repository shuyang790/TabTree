import { expect, test } from "./extension.fixture.js";

async function createTitledTab(context, title) {
  const page = await context.newPage();
  await page.setContent(`<title>${title}</title><main>${title}</main>`);
  await expect.poll(() => page.title()).toBe(title);
  return page;
}

test.describe("Reliability: groups", () => {
  test("group block move keeps membership stable and metadata in sync", async ({ context, sidePanelPage }) => {
    const stamp = Date.now();
    const titles = [
      `Group Reliability A ${stamp}`,
      `Group Reliability B ${stamp}`,
      `Group Reliability C ${stamp}`,
      `Group Reliability D ${stamp}`
    ];
    const pages = [];

    try {
      for (const title of titles) {
        pages.push(await createTitledTab(context, title));
      }

      const ids = await sidePanelPage.evaluate(async (orderedTitles) => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        return orderedTitles.map((title) => tabs.find((tab) => tab.title === title)?.id ?? null);
      }, titles);
      expect(ids.every((id) => Number.isInteger(id))).toBe(true);
      const [a, b, c, d] = ids;

      const actionSummary = await sidePanelPage.evaluate(async ({ a, b, c, d }) => {
        const sourceGroupId = await chrome.tabs.group({ tabIds: [c, d] });
        const targetGroupId = await chrome.tabs.group({ tabIds: [a, b] });

        const moveResponse = await chrome.runtime.sendMessage({
          type: "TREE_ACTION",
          payload: {
            type: "MOVE_GROUP_BLOCK",
            sourceGroupId,
            targetGroupId,
            position: "before"
          }
        });

        const colorResponse = await chrome.runtime.sendMessage({
          type: "TREE_ACTION",
          payload: {
            type: "SET_GROUP_COLOR",
            groupId: sourceGroupId,
            color: "cyan",
            tabIds: [c, d]
          }
        });

        return {
          colorResponse,
          moveResponse,
          sourceGroupId
        };
      }, { a, b, c, d });

      expect(actionSummary.moveResponse?.ok).toBe(true);
      expect(actionSummary.colorResponse?.ok).toBe(true);

      await expect.poll(async () => {
        return sidePanelPage.evaluate(async ({ c, d, sourceGroupId }) => {
          const windowId = (await chrome.windows.getCurrent()).id;
          const [tabs, response] = await Promise.all([
            chrome.tabs.query({ windowId }),
            chrome.runtime.sendMessage({
              type: "GET_STATE",
              payload: { windowId }
            })
          ]);
          const windows = response?.payload?.windows || {};
          const tree = windows[windowId] || windows[String(windowId)] || null;
          const groups = tree?.groups || {};
          const sourceGroup = groups[sourceGroupId] || groups[String(sourceGroupId)] || null;

          const cTab = tabs.find((tab) => tab.id === c) || null;
          const dTab = tabs.find((tab) => tab.id === d) || null;
          const membershipStable = cTab?.groupId === sourceGroupId && dTab?.groupId === sourceGroupId;

          return {
            membershipStable,
            sourceGroupColor: sourceGroup?.color || null
          };
        }, {
          c,
          d,
          sourceGroupId: actionSummary.sourceGroupId
        });
      }, { timeout: 15000 }).toEqual({
        membershipStable: true,
        sourceGroupColor: "cyan"
      });
    } finally {
      await Promise.all(pages.map((page) => page.close().catch(() => {})));
    }
  });
});
