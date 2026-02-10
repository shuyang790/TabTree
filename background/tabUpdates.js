import { nodeIdFromTabId } from "../shared/treeModel.js";

export function shouldProcessTabUpdate(tree, tabId, tab) {
  const node = tree.nodes[nodeIdFromTabId(tabId)];
  if (!node) {
    return true;
  }

  const normalizedGroupId = Number.isInteger(tab.groupId) && tab.groupId >= 0 ? tab.groupId : null;
  const nextTitle = tab.title || node.lastKnownTitle;
  const nextUrl = tab.url || node.lastKnownUrl;
  const nextFavIconUrl = tab.favIconUrl || node.favIconUrl;
  const nextIndex = typeof tab.index === "number" ? tab.index : node.index;
  const nextActive = !!tab.active;
  const selectedChanged = nextActive && tree.selectedTabId !== tabId;

  if (selectedChanged) {
    return true;
  }

  return (
    node.pinned !== !!tab.pinned ||
    node.groupId !== normalizedGroupId ||
    node.index !== nextIndex ||
    node.windowId !== tab.windowId ||
    node.active !== nextActive ||
    node.lastKnownTitle !== nextTitle ||
    node.lastKnownUrl !== nextUrl ||
    node.favIconUrl !== nextFavIconUrl
  );
}
