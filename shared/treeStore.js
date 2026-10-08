import {
  DEFAULT_SETTINGS,
  LOCAL_ARCHIVE_MAX_TREES,
  LOCAL_ARCHIVE_RETENTION_MS,
  LOCAL_RESTORE_ARCHIVE_KEY,
  DENSITY_OPTIONS,
  LOCAL_SNAPSHOT_KEY,
  LOCAL_WINDOW_PREFIX,
  SETTINGS_NUMERIC_RANGES,
  SETTINGS_KEY,
  THEME_PRESET_DARK_KEYS,
  THEME_PRESET_LIGHT_KEYS,
  SYNC_MAX_NODES_PER_WINDOW,
  SYNC_MAX_URL_LENGTH,
  SYNC_MAX_WINDOWS,
  SYNC_SNAPSHOT_KEY
} from "./constants.js";
import { buildSyncSnapshot } from "./treeModel.js";
import { LOCAL_STORAGE_BUDGET_BYTES, planLocalStorage, storageBytes } from "./localStorageBudget.js";
import { boundSyncSnapshot } from "./syncSnapshotBudget.js";
import {
  isPrivateTree, loadPrivateWindowTrees, removePrivateWindowTree, savePrivateWindowTrees
} from "./privateSessionStore.js";

// All local writers share a queue: checking a budget outside this queue races
// other windows' writes. Use the area as the key so tests/contexts stay isolated.
const localWriteQueues = new WeakMap();

function queueLocalWrite(operation) {
  const area = chrome.storage.local;
  const previous = localWriteQueues.get(area) || Promise.resolve();
  const result = previous.then(() => operation(area));
  localWriteQueues.set(area, result.catch(() => {}));
  return result;
}

async function updateLocalStorage(createUpdates, options = {}) {
  return queueLocalWrite(async (area) => {
    const current = await area.get(null);
    const updates = createUpdates(current);
    const merged = { ...current, ...updates };
    const privateIds = new Set(options.privateWindowIds || []);
    for (const [key, tree] of Object.entries(merged)) {
      if (key.startsWith(LOCAL_WINDOW_PREFIX) && isPrivateTree(tree)) privateIds.add(tree.windowId);
    }
    const privateRecord = (tree) => isPrivateTree(tree) || privateIds.has(tree?.windowId);
    for (const [key, tree] of Object.entries(merged)) {
      if (key.startsWith(LOCAL_WINDOW_PREFIX) && privateRecord(tree)) updates[key] = null;
    }
    if (Array.isArray(merged[LOCAL_SNAPSHOT_KEY]?.windows)) {
      updates[LOCAL_SNAPSHOT_KEY] = {
        ...merged[LOCAL_SNAPSHOT_KEY], windows: merged[LOCAL_SNAPSHOT_KEY].windows.filter((tree) => !privateRecord(tree))
      };
    }
    if (Array.isArray(merged[LOCAL_RESTORE_ARCHIVE_KEY]?.entries)) {
      updates[LOCAL_RESTORE_ARCHIVE_KEY] = {
        ...merged[LOCAL_RESTORE_ARCHIVE_KEY], entries: merged[LOCAL_RESTORE_ARCHIVE_KEY].entries.filter((entry) => !privateRecord(entry.tree))
      };
    }
    let plan = planLocalStorage(current, updates, options);
    const tombstonesFor = (next) => Object.fromEntries(
      next.removedKeys.filter((key) => Object.hasOwn(current, key)).map((key) => [key, null])
    );
    let tombstones = tombstonesFor(plan);
    if (plan.bytes + storageBytes(tombstones) > LOCAL_STORAGE_BUDGET_BYTES) {
      // Reserve enough room for every possible deletion marker before replanning.
      const reserve = storageBytes(Object.fromEntries(Object.keys(current).map((key) => [key, null])));
      plan = planLocalStorage(current, updates, {
        ...options, maxBytes: LOCAL_STORAGE_BUDGET_BYTES - reserve
      });
      tombstones = tombstonesFor(plan);
    }
    const changes = { ...tombstones };
    for (const [key, value] of Object.entries(plan.values)) {
      if (JSON.stringify(current[key]) !== JSON.stringify(value)) changes[key] = value;
    }
    // Replace removed values with tiny markers in the SAME set as new data.
    // A rejected set therefore leaves the previous recovery data intact, even
    // when migrating an old unlimited store which is already above Chrome's cap.
    if (Object.keys(changes).length) await area.set(changes);
    if (Object.keys(tombstones).length) await area.remove(Object.keys(tombstones));
    return plan.values;
  });
}

const LEGACY_LIGHT_PRESETS = new Set([
  "catppuccin-latte",
  "everforest-light",
  "gruvbox-light"
]);

const LEGACY_DARK_PRESETS = new Set([
  "catppuccin-frappe",
  "catppuccin-macchiato",
  "catppuccin-mocha",
  "everforest-dark",
  "gruvbox-dark"
]);

const LIGHT_PRESET_KEYS = new Set(THEME_PRESET_LIGHT_KEYS);
const DARK_PRESET_KEYS = new Set(THEME_PRESET_DARK_KEYS);
const DENSITY_OPTION_SET = new Set(DENSITY_OPTIONS);

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function fallbackRestoreArchiveId(windowId, savedAt, index = 0) {
  return `restore-${windowId}-${savedAt}-${index}`;
}

function isValidHexColor(value) {
  return typeof value === "string" && /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(value);
}

function clampNumber(value, { min, max }, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

function normalizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function resolveLegacyThemePresetPair(candidate) {
  const next = { ...candidate };
  const hasLightPreset = nonEmptyString(candidate.themePresetLight);
  const hasDarkPreset = nonEmptyString(candidate.themePresetDark);
  const legacyPreset = nonEmptyString(candidate.themePreset) ? candidate.themePreset : "";

  if (!hasLightPreset) {
    next.themePresetLight = LEGACY_LIGHT_PRESETS.has(legacyPreset)
      ? legacyPreset
      : DEFAULT_SETTINGS.themePresetLight;
  }

  if (!hasDarkPreset) {
    next.themePresetDark = LEGACY_DARK_PRESETS.has(legacyPreset)
      ? legacyPreset
      : DEFAULT_SETTINGS.themePresetDark;
  }

  return next;
}

export function normalizeSettings(candidate) {
  const normalized = resolveLegacyThemePresetPair(candidate || {});

  normalized.themePresetLight = nonEmptyString(normalized.themePresetLight) && LIGHT_PRESET_KEYS.has(normalized.themePresetLight)
    ? normalized.themePresetLight
    : DEFAULT_SETTINGS.themePresetLight;
  normalized.themePresetDark = nonEmptyString(normalized.themePresetDark) && DARK_PRESET_KEYS.has(normalized.themePresetDark)
    ? normalized.themePresetDark
    : DEFAULT_SETTINGS.themePresetDark;
  normalized.accentColor = isValidHexColor(normalized.accentColor)
    ? normalized.accentColor
    : DEFAULT_SETTINGS.accentColor;
  normalized.density = DENSITY_OPTION_SET.has(normalized.density)
    ? normalized.density
    : DEFAULT_SETTINGS.density;

  normalized.fontScale = clampNumber(
    normalized.fontScale,
    SETTINGS_NUMERIC_RANGES.fontScale,
    DEFAULT_SETTINGS.fontScale
  );
  normalized.indentPx = Math.round(clampNumber(
    normalized.indentPx,
    SETTINGS_NUMERIC_RANGES.indentPx,
    DEFAULT_SETTINGS.indentPx
  ));
  normalized.radiusPx = Math.round(clampNumber(
    normalized.radiusPx,
    SETTINGS_NUMERIC_RANGES.radiusPx,
    DEFAULT_SETTINGS.radiusPx
  ));
  normalized.dragExpandDelayMs = Math.round(clampNumber(
    normalized.dragExpandDelayMs,
    SETTINGS_NUMERIC_RANGES.dragExpandDelayMs,
    DEFAULT_SETTINGS.dragExpandDelayMs
  ));
  normalized.dragInsideDwellMs = Math.round(clampNumber(
    normalized.dragInsideDwellMs,
    SETTINGS_NUMERIC_RANGES.dragInsideDwellMs,
    DEFAULT_SETTINGS.dragInsideDwellMs
  ));
  normalized.dragEdgeRatio = clampNumber(
    normalized.dragEdgeRatio,
    SETTINGS_NUMERIC_RANGES.dragEdgeRatio,
    DEFAULT_SETTINGS.dragEdgeRatio
  );

  normalized.dragExpandOnHover = normalizeBoolean(normalized.dragExpandOnHover, DEFAULT_SETTINGS.dragExpandOnHover);
  normalized.showBottomRootDropZone = normalizeBoolean(
    normalized.showBottomRootDropZone,
    DEFAULT_SETTINGS.showBottomRootDropZone
  );
  normalized.showFavicons = normalizeBoolean(normalized.showFavicons, DEFAULT_SETTINGS.showFavicons);
  normalized.showCloseButton = normalizeBoolean(normalized.showCloseButton, DEFAULT_SETTINGS.showCloseButton);
  normalized.showGroupHeaders = normalizeBoolean(normalized.showGroupHeaders, DEFAULT_SETTINGS.showGroupHeaders);
  normalized.showDragStatusChip = normalizeBoolean(
    normalized.showDragStatusChip,
    DEFAULT_SETTINGS.showDragStatusChip
  );
  normalized.shortcutHintsEnabled = normalizeBoolean(
    normalized.shortcutHintsEnabled,
    DEFAULT_SETTINGS.shortcutHintsEnabled
  );
  normalized.confirmCloseSubtree = normalizeBoolean(
    normalized.confirmCloseSubtree,
    DEFAULT_SETTINGS.confirmCloseSubtree
  );
  normalized.confirmCloseBatch = normalizeBoolean(
    normalized.confirmCloseBatch,
    DEFAULT_SETTINGS.confirmCloseBatch
  );

  delete normalized.themeMode;
  delete normalized.themePreset;

  return normalized;
}

function mergeSettings(candidate) {
  return {
    ...DEFAULT_SETTINGS,
    ...normalizeSettings(candidate || {})
  };
}

function normalizeWindowTreePersistenceMeta(windowTree) {
  if (!windowTree || typeof windowTree !== "object") {
    return windowTree;
  }
  const now = Date.now();
  const lastSeenAt = Number.isFinite(windowTree.lastSeenAt)
    ? windowTree.lastSeenAt
    : Number.isFinite(windowTree.updatedAt)
      ? windowTree.updatedAt
      : now;
  const archivedAt = Number.isFinite(windowTree.archivedAt) ? windowTree.archivedAt : null;

  return {
    ...windowTree,
    lastSeenAt,
    archivedAt,
    persistenceVersion: 1
  };
}

function normalizeRestoreArchiveEntry(entry, index = 0) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const tree = normalizeWindowTreePersistenceMeta(entry.tree);
  if (!tree || typeof tree !== "object" || !tree.nodes) {
    return null;
  }

  const savedAt = Number.isFinite(entry.savedAt)
    ? entry.savedAt
    : Number.isFinite(tree.updatedAt)
      ? tree.updatedAt
      : Date.now();
  const id = nonEmptyString(entry.id)
    ? entry.id
    : fallbackRestoreArchiveId(tree.windowId, savedAt, index);

  return {
    id,
    windowId: Number.isInteger(entry.windowId) ? entry.windowId : tree.windowId,
    savedAt,
    tree: {
      ...tree,
      restoreArchiveId: id
    }
  };
}

function pruneRestoreArchiveEntries(entries) {
  const now = Date.now();
  const deduped = new Map();

  for (const [index, entry] of (entries || []).entries()) {
    const normalized = normalizeRestoreArchiveEntry(entry, index);
    if (!normalized || isPrivateTree(normalized.tree)) {
      continue;
    }
    if ((now - normalized.savedAt) > LOCAL_ARCHIVE_RETENTION_MS) {
      continue;
    }

    const existing = deduped.get(normalized.id);
    if (!existing || normalized.savedAt >= existing.savedAt) {
      deduped.set(normalized.id, normalized);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, LOCAL_ARCHIVE_MAX_TREES);
}

export async function loadSettings() {
  const raw = await chrome.storage.sync.get([SETTINGS_KEY]);
  return mergeSettings(raw[SETTINGS_KEY]);
}

export async function saveSettings(settings) {
  const merged = mergeSettings(settings);
  await chrome.storage.sync.set({ [SETTINGS_KEY]: merged });
  return merged;
}

export async function loadWindowTree(windowId) {
  const privateTree = (await loadPrivateWindowTrees()).find((tree) => tree.windowId === windowId);
  if (privateTree) return normalizeWindowTreePersistenceMeta(privateTree);
  const key = `${LOCAL_WINDOW_PREFIX}${windowId}`;
  const raw = await chrome.storage.local.get([key]);
  const tree = raw[key] || null;
  return tree && !isPrivateTree(tree) ? normalizeWindowTreePersistenceMeta(tree) : null;
}

export async function loadAllWindowTrees() {
  const raw = await chrome.storage.local.get(null);
  const trees = [];
  for (const [key, value] of Object.entries(raw || {})) {
    if (!key.startsWith(LOCAL_WINDOW_PREFIX)) {
      continue;
    }
    if (value && typeof value === "object" && typeof value.windowId === "number" && value.nodes && !isPrivateTree(value)) {
      trees.push(normalizeWindowTreePersistenceMeta(value));
    }
  }
  return [...trees, ...await loadPrivateWindowTrees()];
}

export async function saveWindowTree(windowTree) {
  if (isPrivateTree(windowTree)) {
    const writes = await Promise.allSettled([
      savePrivateWindowTrees([windowTree]),
      updateLocalStorage(() => ({}), { privateWindowIds: [windowTree.windowId] })
    ]);
    const failure = writes.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
    return;
  }
  const key = `${LOCAL_WINDOW_PREFIX}${windowTree.windowId}`;
  await updateLocalStorage(() => ({ [key]: normalizeWindowTreePersistenceMeta(windowTree) }));
}

export async function saveWindowTrees(windowsState, windowIds = Object.keys(windowsState)) {
  const privateTrees = windowIds.map((id) => windowsState[id]).filter(isPrivateTree);
  // Session and disk quotas are independent: attempt both so a full private
  // session cannot prevent regular windows from reaching persistent storage.
  const writes = await Promise.allSettled([savePrivateWindowTrees(privateTrees), updateLocalStorage(() => Object.fromEntries(windowIds
    .map((windowId) => windowsState[windowId])
    .filter((tree) => tree && !isPrivateTree(tree))
    .map((tree) => [`${LOCAL_WINDOW_PREFIX}${tree.windowId}`, normalizeWindowTreePersistenceMeta(tree)])), {
    activeWindowIds: Object.values(windowsState).filter((tree) => !isPrivateTree(tree)).map((tree) => tree.windowId),
    privateWindowIds: Object.values(windowsState).filter(isPrivateTree).map((tree) => tree.windowId)
  })]);
  const failure = writes.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

// Called only AFTER startup recovery has read old window IDs and hydrated all
// current windows. Old IDs become optional recovery records, never live trees.
export async function migrateLocalStorage(windowsState) {
  const privateTrees = Object.values(windowsState).filter(isPrivateTree);
  const privateSave = savePrivateWindowTrees(privateTrees).then(() => null, (error) => error);
  const activeWindowIds = Object.values(windowsState).filter((tree) => !isPrivateTree(tree)).map((tree) => tree.windowId);
  const active = new Set(activeWindowIds);
  const saved = await updateLocalStorage((current) => {
    const updates = {};
    for (const [key, tree] of Object.entries(current)) {
      if (key.startsWith(LOCAL_WINDOW_PREFIX) && tree?.nodes && !active.has(tree.windowId)) {
        updates[key] = {
          ...normalizeWindowTreePersistenceMeta(tree),
          archivedAt: Number.isFinite(tree.archivedAt) ? tree.archivedAt : Date.now()
        };
      }
    }
    for (const tree of Object.values(windowsState)) {
      if (isPrivateTree(tree)) continue;
      updates[`${LOCAL_WINDOW_PREFIX}${tree.windowId}`] = normalizeWindowTreePersistenceMeta(tree);
    }
    return updates;
  }, { activeWindowIds, privateWindowIds: privateTrees.map((tree) => tree.windowId) });
  // Old releases had no privacy marker. Current private window IDs let us
  // identify and remove their still-recognizable legacy sync hints safely.
  if (privateTrees.length) {
    const privateIds = new Set(privateTrees.map((tree) => String(tree.windowId)));
    const snapshot = await loadSyncSnapshot();
    if (Array.isArray(snapshot?.windows)) {
      const windows = snapshot.windows.filter((win) => !privateIds.has(win.w));
      if (windows.length !== snapshot.windows.length) {
        await chrome.storage.sync.set({ [SYNC_SNAPSHOT_KEY]: { ...snapshot, windows } });
      }
    }
  }
  const privateError = await privateSave;
  if (privateError) throw privateError;
  return saved;
}

export async function removeWindowTree(windowId) {
  await removePrivateWindowTree(windowId);
  const key = `${LOCAL_WINDOW_PREFIX}${windowId}`;
  await queueLocalWrite((area) => area.remove([key]));
}

export async function loadSyncSnapshot() {
  const raw = await chrome.storage.sync.get([SYNC_SNAPSHOT_KEY]);
  return raw[SYNC_SNAPSHOT_KEY] || null;
}

export async function loadLocalSnapshot() {
  const raw = await chrome.storage.local.get([LOCAL_SNAPSHOT_KEY]);
  const snapshot = raw[LOCAL_SNAPSHOT_KEY] || null;
  return Array.isArray(snapshot?.windows)
    ? { ...snapshot, windows: snapshot.windows.filter((tree) => !isPrivateTree(tree)) }
    : snapshot;
}

export async function loadRestoreArchive() {
  const raw = await chrome.storage.local.get([LOCAL_RESTORE_ARCHIVE_KEY]);
  const archive = raw[LOCAL_RESTORE_ARCHIVE_KEY] || null;
  const entries = pruneRestoreArchiveEntries(archive?.entries || []);

  return {
    v: 1,
    t: Number.isFinite(archive?.t) ? archive.t : 0,
    entries
  };
}

export async function saveSyncSnapshot(windowsState) {
  const regularWindows = Object.fromEntries(Object.entries(windowsState).filter(([, tree]) => !isPrivateTree(tree)));
  const snapshot = boundSyncSnapshot(buildSyncSnapshot(regularWindows, {
    maxWindows: SYNC_MAX_WINDOWS,
    maxNodesPerWindow: SYNC_MAX_NODES_PER_WINDOW,
    maxUrlLength: SYNC_MAX_URL_LENGTH
  }));
  await chrome.storage.sync.set({ [SYNC_SNAPSHOT_KEY]: snapshot });
  return snapshot;
}

export async function saveLocalSnapshot(windowsState) {
  const windowEntries = Object.values(windowsState || {})
    .filter((tree) => tree && typeof tree === "object" && Number.isInteger(tree.windowId) && tree.nodes && !isPrivateTree(tree))
    .map((tree) => normalizeWindowTreePersistenceMeta(tree));

  const snapshot = {
    v: 1,
    t: Date.now(),
    windows: windowEntries
  };

  const saved = await updateLocalStorage(() => ({ [LOCAL_SNAPSHOT_KEY]: snapshot }), {
    activeWindowIds: windowEntries.map((tree) => tree.windowId)
  });
  return saved[LOCAL_SNAPSHOT_KEY] || null;
}

export async function saveRestoreArchive(windowsState, restoreArchiveIdByWindow = {}) {
  const saved = await updateLocalStorage((current) => {
    // Disk is authoritative: a cached archive could resurrect entries evicted by
    // an intervening window write. Build the merge inside the same write queue.
    const baseArchive = current[LOCAL_RESTORE_ARCHIVE_KEY];
    const byId = new Map(pruneRestoreArchiveEntries(baseArchive?.entries || []).map((entry) => [entry.id, entry]));
    const now = Date.now();

    const trees = Object.values(windowsState || {})
      .filter((tree) => tree && typeof tree === "object" && Number.isInteger(tree.windowId) && tree.nodes && !isPrivateTree(tree))
      .map((tree, index) => {
        const archiveId = nonEmptyString(restoreArchiveIdByWindow?.[tree.windowId])
          ? restoreArchiveIdByWindow[tree.windowId]
          : fallbackRestoreArchiveId(tree.windowId, now, index);
        const normalizedTree = normalizeWindowTreePersistenceMeta(tree);
        return {
          id: archiveId,
          windowId: tree.windowId,
          savedAt: now,
          tree: {
            ...normalizedTree,
            restoreArchiveId: archiveId
          }
        };
      });

    for (const entry of trees) {
      byId.set(entry.id, entry);
    }

    const archive = {
      v: 1,
      t: now,
      entries: pruneRestoreArchiveEntries(Array.from(byId.values()))
    };

    return { [LOCAL_RESTORE_ARCHIVE_KEY]: archive };
  }, { activeWindowIds: Object.values(windowsState || {}).map((tree) => tree.windowId) });
  return saved[LOCAL_RESTORE_ARCHIVE_KEY] || { v: 1, t: Date.now(), entries: [] };
}
