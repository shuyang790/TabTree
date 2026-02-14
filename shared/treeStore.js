import {
  DEFAULT_SETTINGS,
  DENSITY_OPTIONS,
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

export async function loadAllWindowTrees() {
  const raw = await chrome.storage.local.get(null);
  const trees = [];
  for (const [key, value] of Object.entries(raw || {})) {
    if (!key.startsWith(LOCAL_WINDOW_PREFIX)) {
      continue;
    }
    if (value && typeof value === "object" && typeof value.windowId === "number" && value.nodes) {
      trees.push(value);
    }
  }
  return trees;
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
