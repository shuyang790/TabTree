const VOLATILE_TREE_KEYS = new Set([
  "archivedAt",
  "lastSeenAt",
  "persistenceVersion",
  "updatedAt"
]);

const RENDER_TREE_KEYS = new Set([
  "groups",
  "nodes",
  "rootNodeIds",
  "selectedTabId",
  "version",
  "windowId"
]);

const RENDER_NODE_KEYS = [
  "active",
  "childNodeIds",
  "collapsed",
  "favIconUrl",
  "groupId",
  "index",
  "lastKnownTitle",
  "lastKnownUrl",
  "nodeId",
  "parentNodeId",
  "pinned",
  "tabId",
  "windowId"
];

const RENDER_GROUP_KEYS = [
  "collapsed",
  "color",
  "id",
  "title"
];

function arraysEqual(a = [], b = []) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function keyedObjectsEqual(a = {}, b = {}, keys) {
  for (const key of keys) {
    const aValue = a?.[key];
    const bValue = b?.[key];
    if (Array.isArray(aValue) || Array.isArray(bValue)) {
      if (!arraysEqual(aValue || [], bValue || [])) {
        return false;
      }
      continue;
    }
    if (aValue !== bValue) {
      return false;
    }
  }
  return true;
}

function mapsEqualByKeys(a = {}, b = {}, keys) {
  const aKeys = Object.keys(a || {}).sort();
  const bKeys = Object.keys(b || {}).sort();
  if (!arraysEqual(aKeys, bKeys)) {
    return false;
  }
  for (const key of aKeys) {
    if (!keyedObjectsEqual(a[key], b[key], keys)) {
      return false;
    }
  }
  return true;
}

function renderTreeDataEqual(previous, next) {
  if (!previous || !next) {
    return false;
  }
  if (previous.windowId !== next.windowId || previous.version !== next.version) {
    return false;
  }
  if (previous.selectedTabId !== next.selectedTabId) {
    return false;
  }
  if (!arraysEqual(previous.rootNodeIds || [], next.rootNodeIds || [])) {
    return false;
  }
  if (!mapsEqualByKeys(previous.groups || {}, next.groups || {}, RENDER_GROUP_KEYS)) {
    return false;
  }
  return mapsEqualByKeys(previous.nodes || {}, next.nodes || {}, RENDER_NODE_KEYS);
}

function metadataEntries(tree = {}) {
  return Object.entries(tree)
    .filter(([key]) => !RENDER_TREE_KEYS.has(key) && !VOLATILE_TREE_KEYS.has(key))
    .sort(([a], [b]) => a.localeCompare(b));
}

function metadataEqual(previous, next) {
  const previousEntries = metadataEntries(previous);
  const nextEntries = metadataEntries(next);
  if (previousEntries.length !== nextEntries.length) {
    return false;
  }
  for (let i = 0; i < previousEntries.length; i += 1) {
    const [previousKey, previousValue] = previousEntries[i];
    const [nextKey, nextValue] = nextEntries[i];
    if (previousKey !== nextKey || previousValue !== nextValue) {
      return false;
    }
  }
  return true;
}

export function classifyWindowTreeChange(previous, next) {
  if (!previous || !next) {
    return "render";
  }
  if (!renderTreeDataEqual(previous, next)) {
    return "render";
  }
  if (!metadataEqual(previous, next)) {
    return "metadata";
  }
  return "none";
}
