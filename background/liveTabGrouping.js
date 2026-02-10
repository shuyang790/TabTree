export async function groupLiveTabIdsByWindow(tabIds, { queryTabs, getTab }) {
  const grouped = new Map();
  const uniqueTabIds = Array.from(new Set(tabIds.filter((id) => Number.isFinite(id))));
  if (!uniqueTabIds.length) {
    return grouped;
  }

  const requested = new Set(uniqueTabIds);
  let tabs = [];
  try {
    tabs = (await queryTabs()).filter((tab) => requested.has(tab.id));
  } catch {
    tabs = await Promise.all(uniqueTabIds.map((tabId) => getTab(tabId)));
  }

  for (const tab of tabs) {
    if (!tab || !requested.has(tab.id)) {
      continue;
    }
    if (!grouped.has(tab.windowId)) {
      grouped.set(tab.windowId, []);
    }
    grouped.get(tab.windowId).push(tab.id);
  }
  return grouped;
}
