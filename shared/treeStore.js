import {
  DEFAULT_SETTINGS,
  LOCAL_WINDOW_PREFIX,
  SETTINGS_KEY,
  STORAGE_WRITE_DEBOUNCE_MS,
  SYNC_MAX_NODES_PER_WINDOW,
  SYNC_MAX_URL_LENGTH,
  SYNC_MAX_WINDOWS,
  SYNC_SNAPSHOT_KEY
} from "./constants.js";
import { buildSyncSnapshot } from "./treeModel.js";

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

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
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

  normalized.themePresetLight = nonEmptyString(normalized.themePresetLight)
    ? normalized.themePresetLight
    : DEFAULT_SETTINGS.themePresetLight;
  normalized.themePresetDark = nonEmptyString(normalized.themePresetDark)
    ? normalized.themePresetDark
    : DEFAULT_SETTINGS.themePresetDark;

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
  const key = `${LOCAL_WINDOW_PREFIX}${windowId}`;
  const raw = await chrome.storage.local.get([key]);
  return raw[key] || null;
}

export async function saveWindowTree(windowTree) {
  const key = `${LOCAL_WINDOW_PREFIX}${windowTree.windowId}`;
  await chrome.storage.local.set({ [key]: windowTree });
}

export async function removeWindowTree(windowId) {
  const key = `${LOCAL_WINDOW_PREFIX}${windowId}`;
  await chrome.storage.local.remove([key]);
}

export async function loadSyncSnapshot() {
  const raw = await chrome.storage.sync.get([SYNC_SNAPSHOT_KEY]);
  return raw[SYNC_SNAPSHOT_KEY] || null;
}

export async function saveSyncSnapshot(windowsState) {
  const snapshot = buildSyncSnapshot(windowsState, {
    maxWindows: SYNC_MAX_WINDOWS,
    maxNodesPerWindow: SYNC_MAX_NODES_PER_WINDOW,
    maxUrlLength: SYNC_MAX_URL_LENGTH
  });
  await chrome.storage.sync.set({ [SYNC_SNAPSHOT_KEY]: snapshot });
  return snapshot;
}

export function createDebouncedPersister(onFlush) {
  let timer = null;
  return function schedule() {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(async () => {
      timer = null;
      await onFlush();
    }, STORAGE_WRITE_DEBOUNCE_MS);
  };
}
