// Chrome clears storage.session on browser restart, extension reload or disable.
// Private tree state must never fall back to local/sync when this area fails.
export const PRIVATE_WINDOW_PREFIX = "tree.private.session.v1.";

export function isPrivateTree(tree) {
  return !!tree?.incognito || Object.values(tree?.nodes || {}).some((node) => node?.incognito);
}

const queues = new WeakMap();

function queueSessionWrite(operation) {
  const area = chrome.storage.session;
  if (!area) return Promise.reject(new Error("Private session storage is unavailable"));
  const result = (queues.get(area) || Promise.resolve()).then(() => operation(area));
  queues.set(area, result.catch(() => {}));
  return result;
}

export async function loadPrivateWindowTrees() {
  if (!chrome.storage.session) return [];
  const raw = await chrome.storage.session.get(null);
  return Object.entries(raw).filter(([key, value]) =>
    key.startsWith(PRIVATE_WINDOW_PREFIX) && value?.nodes && isPrivateTree(value)
  ).map(([, value]) => value);
}

export async function savePrivateWindowTrees(trees) {
  if (!trees.length) return;
  await queueSessionWrite((area) => area.set(Object.fromEntries(trees.map((tree) => [
    `${PRIVATE_WINDOW_PREFIX}${tree.windowId}`, { ...tree, incognito: true }
  ]))));
}

export async function removePrivateWindowTree(windowId) {
  if (!chrome.storage.session) return;
  await queueSessionWrite((area) => area.remove([`${PRIVATE_WINDOW_PREFIX}${windowId}`]));
}

export async function prunePrivateWindowTrees(activeWindowIds) {
  if (!chrome.storage.session) return;
  const active = new Set(activeWindowIds);
  await queueSessionWrite(async (area) => {
    const raw = await area.get(null);
    const stale = Object.entries(raw).filter(([key, tree]) =>
      key.startsWith(PRIVATE_WINDOW_PREFIX) && !active.has(tree?.windowId)
    ).map(([key]) => key);
    if (stale.length) await area.remove(stale);
  });
}
