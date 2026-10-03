import {
  LOCAL_ARCHIVE_MAX_TREES,
  LOCAL_ARCHIVE_RETENTION_MS,
  LOCAL_RESTORE_ARCHIVE_KEY,
  LOCAL_SNAPSHOT_KEY,
  LOCAL_WINDOW_PREFIX
} from "./constants.js";

export const LOCAL_STORAGE_BUDGET_BYTES = 8 * 1024 * 1024;

const encoder = new TextEncoder();

function itemBytes(key, value) {
  let numberReserve = 0;
  const json = JSON.stringify(value, (_key, item) => {
    if (typeof item === "number" && Number.isFinite(item)
      && (!Number.isInteger(item) || item < -2147483648 || item > 2147483647 || Object.is(item, -0))) {
      // Chrome stores non-int32 numbers as doubles. Its shortest conversion uses
      // a 32-byte buffer and different exponent/.0 rules from JSON.stringify.
      // Reserve that bound rather than undercounting timestamps or decimals.
      numberReserve += Math.max(0, 32 - JSON.stringify(item).length);
    }
    return item;
  });
  // Chromium's JSON writer escapes these even though JSON.stringify does not.
  // See base/json/string_escape.cc and string_number_conversions_internal.h.
  const chromiumJson = json.replace(/[<\u2028\u2029]/g, (character) => {
    if (character === "<") return "\\u003C";
    return character === "\u2028" ? "\\u2028" : "\\u2029";
  });
  return encoder.encode(key).length + encoder.encode(chromiumJson).length + numberReserve;
}

// Conservative quota bytes for the plain JSON data saved by TabTree. Numbers
// outside int32 receive headroom for Chromium's native double serialization.
export function storageBytes(values) {
  return Object.entries(values).reduce((total, [key, value]) => total + itemBytes(key, value), 0);
}

export class LocalStorageCapacityError extends Error {
  constructor(bytes, budget) {
    super(`Local tree data requires ${bytes} bytes; the storage budget is ${budget} bytes.`);
    this.name = "LocalStorageCapacityError";
    this.code = "LOCAL_STORAGE_CAPACITY";
    this.bytes = bytes;
    this.budget = budget;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function compactWindowTree(tree) {
  if (!isObject(tree) || !isObject(tree.nodes)) {
    return tree;
  }
  return {
    ...tree,
    nodes: Object.fromEntries(Object.entries(tree.nodes).map(([id, node]) => {
      if (!isObject(node)) {
        return [id, node];
      }
      const { favIconUrl: _favIconUrl, ...persistedNode } = node;
      return [id, persistedNode];
    }))
  };
}

function windowIdFromKey(key) {
  if (!key.startsWith(LOCAL_WINDOW_PREFIX)) {
    return null;
  }
  const suffix = key.slice(LOCAL_WINDOW_PREFIX.length);
  if (!/^-?\d+$/.test(suffix)) {
    return null;
  }
  const windowId = Number(suffix);
  return Number.isSafeInteger(windowId) ? windowId : null;
}

function treeTimestamp(tree) {
  return Math.max(...[tree.updatedAt, tree.lastSeenAt, tree.archivedAt]
    .map((value) => Number.isFinite(value) ? value : 0));
}

function archiveTimestamp(entry, now) {
  return Number.isFinite(entry.savedAt)
    ? entry.savedAt
    : Number.isFinite(entry.tree?.updatedAt) ? entry.tree.updatedAt : now;
}

function compactArchive(archive, now) {
  if (!isObject(archive) || !Array.isArray(archive.entries)) {
    return archive;
  }
  const entries = archive.entries
    .filter((entry) => isObject(entry) && isObject(entry.tree) && isObject(entry.tree.nodes))
    .filter((entry) => now - archiveTimestamp(entry, now) <= LOCAL_ARCHIVE_RETENTION_MS)
    .map((entry) => ({ ...entry, tree: compactWindowTree(entry.tree) }))
    .sort((a, b) => archiveTimestamp(b, now) - archiveTimestamp(a, now))
    .slice(0, LOCAL_ARCHIVE_MAX_TREES);
  return { ...archive, entries };
}

/**
 * Plan the complete local area before any writes. Canonical active trees are
 * mandatory; complete recovery copies can be discarded to make room for them.
 */
export function planLocalStorage(current, updates = {}, {
  activeWindowIds = null,
  maxBytes = LOCAL_STORAGE_BUDGET_BYTES,
  now = Date.now()
} = {}) {
  const original = { ...current, ...updates };
  const values = { ...original };
  const explicitActiveIds = activeWindowIds === null ? null : new Set(activeWindowIds);
  const protectedKeys = new Set();
  const windowRecords = [];

  for (const [key, value] of Object.entries(values)) {
    const windowId = windowIdFromKey(key);
    if (value === null && (windowId !== null || key === LOCAL_SNAPSHOT_KEY || key === LOCAL_RESTORE_ARCHIVE_KEY)) {
      // A prior set may have committed deletion markers before remove failed.
      delete values[key];
      continue;
    }
    if (windowId === null || !isObject(value) || !isObject(value.nodes)) {
      continue;
    }
    values[key] = compactWindowTree(value);
    const unarchived = !Number.isFinite(value.archivedAt);
    const incomingUnarchived = Object.hasOwn(updates, key) && unarchived;
    const active = explicitActiveIds === null ? unarchived : explicitActiveIds.has(windowId);
    if (active || incomingUnarchived) {
      protectedKeys.add(key);
    }
    windowRecords.push({ key, tree: values[key] });
  }

  const snapshot = values[LOCAL_SNAPSHOT_KEY];
  if (isObject(snapshot) && Array.isArray(snapshot.windows)) {
    values[LOCAL_SNAPSHOT_KEY] = { ...snapshot, windows: snapshot.windows.map(compactWindowTree) };
  }
  if (Object.hasOwn(values, LOCAL_RESTORE_ARCHIVE_KEY)) {
    values[LOCAL_RESTORE_ARCHIVE_KEY] = compactArchive(values[LOCAL_RESTORE_ARCHIVE_KEY], now);
  }

  // Enforce the existing age/count policy without aging out active windows.
  const archivedWindows = windowRecords
    .filter(({ key, tree }) => !protectedKeys.has(key) && Number.isFinite(tree.archivedAt))
    .sort((a, b) => treeTimestamp(b.tree) - treeTimestamp(a.tree));
  let retainedArchivedWindows = 0;
  for (const { key, tree } of archivedWindows) {
    if (now - tree.archivedAt > LOCAL_ARCHIVE_RETENTION_MS
      || retainedArchivedWindows >= LOCAL_ARCHIVE_MAX_TREES) {
      delete values[key];
    } else {
      retainedArchivedWindows += 1;
    }
  }

  let bytes = storageBytes(values);
  const removeKey = (key) => {
    if (Object.hasOwn(values, key)) {
      bytes -= itemBytes(key, values[key]);
      delete values[key];
    }
  };

  if (bytes > maxBytes) {
    removeKey(LOCAL_SNAPSHOT_KEY);
  }

  if (bytes > maxBytes && Object.hasOwn(values, LOCAL_RESTORE_ARCHIVE_KEY)) {
    const archive = values[LOCAL_RESTORE_ARCHIVE_KEY];
    if (isObject(archive) && Array.isArray(archive.entries)) {
      const entries = [...archive.entries];
      while (bytes > maxBytes && entries.length) {
        const previousBytes = itemBytes(LOCAL_RESTORE_ARCHIVE_KEY, values[LOCAL_RESTORE_ARCHIVE_KEY]);
        entries.pop();
        values[LOCAL_RESTORE_ARCHIVE_KEY] = { ...archive, entries: [...entries] };
        bytes += itemBytes(LOCAL_RESTORE_ARCHIVE_KEY, values[LOCAL_RESTORE_ARCHIVE_KEY]) - previousBytes;
      }
    }
    if (bytes > maxBytes) {
      removeKey(LOCAL_RESTORE_ARCHIVE_KEY);
    }
  }

  const disposableWindows = windowRecords
    .filter(({ key }) => !protectedKeys.has(key) && Object.hasOwn(values, key))
    .sort((a, b) => treeTimestamp(a.tree) - treeTimestamp(b.tree));
  for (const { key } of disposableWindows) {
    if (bytes <= maxBytes) {
      break;
    }
    removeKey(key);
  }

  if (bytes > maxBytes) {
    throw new LocalStorageCapacityError(bytes, maxBytes);
  }

  return {
    values,
    removedKeys: Object.keys(original).filter((key) => !Object.hasOwn(values, key)),
    bytes
  };
}
