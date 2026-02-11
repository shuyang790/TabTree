import { DEFAULT_SETTINGS, MESSAGE_TYPES, TREE_ACTIONS } from "../shared/constants.js";
import { applyRuntimeStateUpdate } from "./statePatch.js";

const GROUP_COLOR_MAP = {
  grey: "#8a909c",
  blue: "#4d8af0",
  red: "#e45858",
  yellow: "#d9a316",
  green: "#45a06f",
  pink: "#d85aa5",
  purple: "#8d67d5",
  cyan: "#3da9b5",
  orange: "#dc7d2d"
};

const GROUP_COLOR_OPTIONS = [
  { value: "grey", labelKey: "colorGrey" },
  { value: "blue", labelKey: "colorBlue" },
  { value: "red", labelKey: "colorRed" },
  { value: "yellow", labelKey: "colorYellow" },
  { value: "green", labelKey: "colorGreen" },
  { value: "pink", labelKey: "colorPink" },
  { value: "purple", labelKey: "colorPurple" },
  { value: "cyan", labelKey: "colorCyan" },
  { value: "orange", labelKey: "colorOrange" }
];

const CONTEXT_INLINE_GROUP_LIMIT = 5;
const SETTINGS_SECTION_KEYS = {
  appearance: ["themePresetLight", "themePresetDark", "accentColor", "density", "fontScale", "indentPx", "radiusPx"],
  behavior: ["showFavicons", "showCloseButton", "showGroupHeaders", "shortcutHintsEnabled"],
  safety: ["confirmCloseSubtree", "confirmCloseBatch"]
};

const BASE_THEME_TOKENS = {
  light: {
    bg: "#f7f9fc",
    bgElev: "#ffffff",
    text: "#1f2533",
    textMuted: "#5f6b84",
    border: "#d7dfec",
    rowHover: "#edf2fc",
    rowActive: "#dce8fd",
    shadow: "0 8px 20px rgba(26, 39, 75, 0.08)",
    focusRing: "color-mix(in srgb, var(--accent), white 35%)",
    accent: "#0b57d0"
  },
  dark: {
    bg: "#111522",
    bgElev: "#182033",
    text: "#e5ebff",
    textMuted: "#9ca8c8",
    border: "#2c3654",
    rowHover: "#223055",
    rowActive: "#2b3e6c",
    shadow: "0 10px 24px rgba(0, 0, 0, 0.28)",
    focusRing: "color-mix(in srgb, var(--accent), black 30%)",
    accent: "#0b57d0"
  }
};

const THEME_PRESETS = {
  "catppuccin-latte": {
    mode: "light",
    bg: "#eff1f5",
    bgElev: "#e6e9ef",
    text: "#4c4f69",
    textMuted: "#6c6f85",
    border: "#ccd0da",
    rowHover: "#dce0e8",
    rowActive: "#bcc0cc",
    shadow: "0 8px 20px rgba(76, 79, 105, 0.16)",
    focusRing: "color-mix(in srgb, var(--accent), white 28%)",
    accent: "#1e66f5"
  },
  "catppuccin-frappe": {
    mode: "dark",
    bg: "#303446",
    bgElev: "#292c3c",
    text: "#c6d0f5",
    textMuted: "#a5adce",
    border: "#414559",
    rowHover: "#3b3f53",
    rowActive: "#51576d",
    shadow: "0 10px 24px rgba(17, 17, 27, 0.34)",
    focusRing: "color-mix(in srgb, var(--accent), black 24%)",
    accent: "#8caaee"
  },
  "catppuccin-macchiato": {
    mode: "dark",
    bg: "#24273a",
    bgElev: "#1e2030",
    text: "#cad3f5",
    textMuted: "#a5adcb",
    border: "#363a4f",
    rowHover: "#2b2f44",
    rowActive: "#494d64",
    shadow: "0 10px 24px rgba(0, 0, 0, 0.36)",
    focusRing: "color-mix(in srgb, var(--accent), black 24%)",
    accent: "#8aadf4"
  },
  "catppuccin-mocha": {
    mode: "dark",
    bg: "#1e1e2e",
    bgElev: "#181825",
    text: "#cdd6f4",
    textMuted: "#a6adc8",
    border: "#313244",
    rowHover: "#2a2b3c",
    rowActive: "#45475a",
    shadow: "0 10px 24px rgba(0, 0, 0, 0.4)",
    focusRing: "color-mix(in srgb, var(--accent), black 24%)",
    accent: "#89b4fa"
  },
  "everforest-light": {
    mode: "light",
    bg: "#f3ead3",
    bgElev: "#ede5cd",
    text: "#5c6a72",
    textMuted: "#829181",
    border: "#d3c6aa",
    rowHover: "#e4dcc3",
    rowActive: "#d8caac",
    shadow: "0 8px 20px rgba(92, 106, 114, 0.18)",
    focusRing: "color-mix(in srgb, var(--accent), white 30%)",
    accent: "#3a94c5"
  },
  "everforest-dark": {
    mode: "dark",
    bg: "#2d353b",
    bgElev: "#272e33",
    text: "#d3c6aa",
    textMuted: "#9da9a0",
    border: "#414b50",
    rowHover: "#343f44",
    rowActive: "#475258",
    shadow: "0 10px 24px rgba(0, 0, 0, 0.3)",
    focusRing: "color-mix(in srgb, var(--accent), black 20%)",
    accent: "#7fbbb3"
  },
  "gruvbox-light": {
    mode: "light",
    bg: "#fbf1c7",
    bgElev: "#f2e5bc",
    text: "#3c3836",
    textMuted: "#665c54",
    border: "#d5c4a1",
    rowHover: "#ebdbb2",
    rowActive: "#d5c4a1",
    shadow: "0 8px 20px rgba(60, 56, 54, 0.16)",
    focusRing: "color-mix(in srgb, var(--accent), white 26%)",
    accent: "#458588"
  },
  "gruvbox-dark": {
    mode: "dark",
    bg: "#282828",
    bgElev: "#1d2021",
    text: "#ebdbb2",
    textMuted: "#a89984",
    border: "#504945",
    rowHover: "#32302f",
    rowActive: "#504945",
    shadow: "0 10px 24px rgba(0, 0, 0, 0.34)",
    focusRing: "color-mix(in srgb, var(--accent), black 20%)",
    accent: "#83a598"
  },
  "tokyonight-day": {
    mode: "light",
    bg: "#e1e2e7",
    bgElev: "#d6d8e0",
    text: "#3760bf",
    textMuted: "#6172b0",
    border: "#b7c1e3",
    rowHover: "#c4c8da",
    rowActive: "#b4b8d0",
    shadow: "0 8px 20px rgba(80, 96, 144, 0.18)",
    focusRing: "color-mix(in srgb, var(--accent), white 28%)",
    accent: "#2e7de9"
  },
  "tokyonight-night": {
    mode: "dark",
    bg: "#1a1b26",
    bgElev: "#16161e",
    text: "#c0caf5",
    textMuted: "#9aa5ce",
    border: "#2a2f4a",
    rowHover: "#20253b",
    rowActive: "#2a3152",
    shadow: "0 10px 24px rgba(0, 0, 0, 0.36)",
    focusRing: "color-mix(in srgb, var(--accent), black 22%)",
    accent: "#7aa2f7"
  },
  "kanagawa-lotus": {
    mode: "light",
    bg: "#f2ecbc",
    bgElev: "#e8ddb4",
    text: "#545464",
    textMuted: "#717c7c",
    border: "#c9cbd1",
    rowHover: "#e4d9b8",
    rowActive: "#d8ccb0",
    shadow: "0 8px 20px rgba(84, 84, 100, 0.18)",
    focusRing: "color-mix(in srgb, var(--accent), white 28%)",
    accent: "#4d699b"
  },
  "kanagawa-wave": {
    mode: "dark",
    bg: "#1f1f28",
    bgElev: "#181820",
    text: "#dcd7ba",
    textMuted: "#a6a69c",
    border: "#2a2a37",
    rowHover: "#252536",
    rowActive: "#2d3040",
    shadow: "0 10px 24px rgba(0, 0, 0, 0.34)",
    focusRing: "color-mix(in srgb, var(--accent), black 22%)",
    accent: "#7e9cd8"
  },
  "one-light": {
    mode: "light",
    bg: "#fafafa",
    bgElev: "#ffffff",
    text: "#383a42",
    textMuted: "#696c77",
    border: "#d9dce3",
    rowHover: "#eef1f7",
    rowActive: "#dde3ee",
    shadow: "0 8px 20px rgba(56, 58, 66, 0.13)",
    focusRing: "color-mix(in srgb, var(--accent), white 30%)",
    accent: "#4078f2"
  },
  "one-dark": {
    mode: "dark",
    bg: "#282c34",
    bgElev: "#21252b",
    text: "#abb2bf",
    textMuted: "#8a909e",
    border: "#3a404b",
    rowHover: "#313741",
    rowActive: "#3a4250",
    shadow: "0 10px 24px rgba(0, 0, 0, 0.35)",
    focusRing: "color-mix(in srgb, var(--accent), black 20%)",
    accent: "#61afef"
  }
};

const BASE_LIGHT_PRESET = "base-light";
const BASE_DARK_PRESET = "base-dark";
const DEFAULT_ACCENT = "#0b57d0";
const DROP_EDGE_RATIO = 0.2;
const INSIDE_DROP_DWELL_MS = 180;
const AUTO_SCROLL_EDGE_PX = 56;
const AUTO_SCROLL_MAX_STEP = 18;
const DROP_TARGET_CLASSES = [
  "drop-valid-before",
  "drop-valid-after",
  "drop-valid-inside",
  "drop-invalid",
  // Cleanup legacy classes from prior versions.
  "drop-before",
  "drop-after",
  "drop-inside",
  "group-drop-before",
  "group-drop-after"
];

const DENSITY_PRESETS = {
  compact: {
    rowHeight: 28,
    nodeGap: 1,
    treePadY: 6,
    childPad: 6,
    topbarPadY: 8
  },
  comfortable: {
    rowHeight: 34,
    nodeGap: 2,
    treePadY: 10,
    childPad: 8,
    topbarPadY: 10
  },
  cozy: {
    rowHeight: 38,
    nodeGap: 4,
    treePadY: 12,
    childPad: 10,
    topbarPadY: 11
  },
  spacious: {
    rowHeight: 42,
    nodeGap: 6,
    treePadY: 14,
    childPad: 12,
    topbarPadY: 12
  }
};

const state = {
  settings: null,
  windows: {},
  panelWindowId: null,
  focusedWindowId: null,
  search: "",
  searchRenderTimer: null,
  renderRafId: null,
  visibleTabIds: [],
  draggingTabIds: [],
  draggingGroupId: null,
  dragTarget: {
    kind: null,
    tabId: null,
    groupId: null,
    position: null,
    valid: false
  },
  dragTargetElement: null,
  dragInsideHover: {
    kind: null,
    id: null,
    since: 0
  },
  dragAutoScroll: {
    active: false,
    clientY: 0,
    rafId: null
  },
  selectedTabIds: new Set(),
  selectionAnchorTabId: null,
  focusedTabId: null,
  settingsReturnFocusEl: null,
  confirmReturnFocusEl: null,
  pendingCloseAction: null,
  contextMenu: {
    open: false,
    kind: null,
    x: 0,
    y: 0,
    primaryTabId: null,
    scopeTabIds: [],
    groupId: null,
    windowId: null,
    renameOpen: false,
    returnTabId: null
  },
  lastRenderedWindowId: null,
  lastRenderedShowGroupHeaders: null,
  lastRenderedShowFavicons: null,
  lastRenderedShowCloseButton: null
};

const dom = {
  treeRoot: document.getElementById("tree-root"),
  search: document.getElementById("search"),
  searchWrap: document.getElementById("search-wrap"),
  searchDropHint: document.getElementById("search-drop-hint"),
  addChildGlobal: document.getElementById("add-child-global"),
  settingsPanel: document.getElementById("settings-panel"),
  openSettings: document.getElementById("open-settings"),
  closeSettings: document.getElementById("close-settings"),
  resetAppearanceSettings: document.getElementById("reset-appearance-settings"),
  resetBehaviorSettings: document.getElementById("reset-behavior-settings"),
  resetSafetySettings: document.getElementById("reset-safety-settings"),
  settingsForm: document.getElementById("settings-form"),
  hintBar: document.getElementById("hint-bar"),
  confirmOverlay: document.getElementById("confirm-overlay"),
  confirmMessage: document.getElementById("confirm-message"),
  confirmSkip: document.getElementById("confirm-skip"),
  confirmCancel: document.getElementById("confirm-cancel"),
  confirmOk: document.getElementById("confirm-ok"),
  contextMenu: document.getElementById("context-menu")
};

if (dom.contextMenu) {
  dom.contextMenu.tabIndex = -1;
}

function t(key, substitutions = [], fallback = key) {
  const substitutionsList = Array.isArray(substitutions) ? substitutions : [substitutions];
  const message = chrome.i18n.getMessage(key, substitutionsList);
  return message || fallback;
}

function localizeStaticUi() {
  const uiLanguage = chrome.i18n.getUILanguage();
  if (uiLanguage) {
    document.documentElement.lang = uiLanguage;
  }

  for (const element of document.querySelectorAll("[data-i18n]")) {
    const key = element.dataset.i18n;
    element.textContent = t(key, [], element.textContent);
  }

  for (const element of document.querySelectorAll("[data-i18n-title]")) {
    const key = element.dataset.i18nTitle;
    const fallback = element.getAttribute("title") || "";
    element.setAttribute("title", t(key, [], fallback));
  }

  for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
    const key = element.dataset.i18nPlaceholder;
    const fallback = element.getAttribute("placeholder") || "";
    element.setAttribute("placeholder", t(key, [], fallback));
  }

  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
    const key = element.dataset.i18nAriaLabel;
    const fallback = element.getAttribute("aria-label") || "";
    element.setAttribute("aria-label", t(key, [], fallback));
  }
}

localizeStaticUi();

function nodeId(tabId) {
  return `tab:${tabId}`;
}

function currentWindowTree() {
  if (Number.isInteger(state.panelWindowId) && state.windows[state.panelWindowId]) {
    return state.windows[state.panelWindowId];
  }
  if (Number.isInteger(state.focusedWindowId) && state.windows[state.focusedWindowId]) {
    return state.windows[state.focusedWindowId];
  }
  const firstWindowId = Object.keys(state.windows)[0];
  return firstWindowId ? state.windows[firstWindowId] : null;
}

async function resolvePanelWindowId() {
  try {
    const current = await chrome.windows.getCurrent();
    return Number.isInteger(current?.id) ? current.id : null;
  } catch {
    return null;
  }
}

function currentActiveTabId() {
  const tree = currentWindowTree();
  return tree?.selectedTabId || null;
}

function selectedTabIdsArray() {
  return Array.from(state.selectedTabIds);
}

function resetContextMenuState() {
  state.contextMenu = {
    open: false,
    kind: null,
    x: 0,
    y: 0,
    primaryTabId: null,
    scopeTabIds: [],
    groupId: null,
    windowId: null,
    renameOpen: false,
    returnTabId: null
  };
}

function visibleTabIdsInOrder() {
  return [...state.visibleTabIds];
}

function refreshVisibleTabIds() {
  state.visibleTabIds = Array.from(dom.treeRoot.querySelectorAll(".tree-row[data-tab-id]"))
    .map((row) => Number(row.dataset.tabId))
    .filter((id) => Number.isFinite(id));
}

function selectedExistingTabIds(tree = currentWindowTree()) {
  if (!tree) {
    return [];
  }
  return selectedTabIdsArray()
    .filter((id) => Number.isFinite(id))
    .filter((id) => !!tree.nodes[nodeId(id)]);
}

function setTreeRowTabStop(preferredTabId = null) {
  const rows = Array.from(dom.treeRoot.querySelectorAll(".tree-row[data-tab-id]"));
  if (!rows.length) {
    state.focusedTabId = null;
    return null;
  }

  const candidateIds = [
    preferredTabId,
    state.focusedTabId,
    state.selectionAnchorTabId,
    currentActiveTabId()
  ];
  const targetId = candidateIds.find((id) => Number.isFinite(id));
  const target = rows.find((row) => Number(row.dataset.tabId) === targetId) || rows[0];
  for (const row of rows) {
    row.tabIndex = row === target ? 0 : -1;
  }

  const tabId = Number(target.dataset.tabId);
  state.focusedTabId = Number.isFinite(tabId) ? tabId : null;
  return target;
}

function focusTreeRow(tabId) {
  const row = setTreeRowTabStop(tabId);
  if (row) {
    row.focus();
  }
  return row;
}

function syncRenderedSelectionState() {
  const tree = currentWindowTree();
  for (const row of dom.treeRoot.querySelectorAll(".tree-row[data-tab-id]")) {
    const tabId = Number(row.dataset.tabId);
    const selected = Number.isFinite(tabId) && state.selectedTabIds.has(tabId);
    const active = Number.isFinite(tabId) && tree?.selectedTabId === tabId;
    row.classList.toggle("selected", selected);
    row.classList.toggle("active", active);
    row.setAttribute("aria-selected", selected ? "true" : "false");
  }
  setTreeRowTabStop(state.focusedTabId);
}

function replaceSelection(tabIds, anchorTabId = null) {
  state.selectedTabIds = new Set(tabIds.filter((id) => Number.isFinite(id)));
  state.selectionAnchorTabId = anchorTabId;
}

function toggleSelection(tabId) {
  if (state.selectedTabIds.has(tabId)) {
    state.selectedTabIds.delete(tabId);
  } else {
    state.selectedTabIds.add(tabId);
  }
  if (state.selectedTabIds.size === 0) {
    state.selectionAnchorTabId = null;
  } else if (!state.selectionAnchorTabId) {
    state.selectionAnchorTabId = tabId;
  }
}

function selectRangeTo(tabId) {
  const ordered = visibleTabIdsInOrder();
  if (!ordered.length) {
    replaceSelection([tabId], tabId);
    return;
  }
  const anchor = state.selectionAnchorTabId ?? tabId;
  const anchorIndex = ordered.indexOf(anchor);
  const targetIndex = ordered.indexOf(tabId);
  if (anchorIndex < 0 || targetIndex < 0) {
    replaceSelection([tabId], tabId);
    return;
  }

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  replaceSelection(ordered.slice(start, end + 1), anchor);
}

function pruneSelection(tree) {
  if (!tree) {
    replaceSelection([], null);
    return;
  }
  const existing = new Set(Object.values(tree.nodes).map((n) => n.tabId));
  const next = selectedTabIdsArray().filter((id) => existing.has(id));
  const anchor = existing.has(state.selectionAnchorTabId) ? state.selectionAnchorTabId : null;
  state.selectedTabIds = new Set(next);
  state.selectionAnchorTabId = anchor;
}

function getSystemColorMode() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolvePresetTokens(presetKey, fallbackMode) {
  if (presetKey === BASE_LIGHT_PRESET) {
    return BASE_THEME_TOKENS.light;
  }

  if (presetKey === BASE_DARK_PRESET) {
    return BASE_THEME_TOKENS.dark;
  }

  const preset = THEME_PRESETS[presetKey];
  if (preset) {
    return preset;
  }

  return BASE_THEME_TOKENS[fallbackMode] || BASE_THEME_TOKENS.light;
}

function resolveThemeTokens(settings) {
  const mode = getSystemColorMode();
  const presetKey = mode === "dark"
    ? settings.themePresetDark
    : settings.themePresetLight;

  return {
    mode,
    tokens: resolvePresetTokens(presetKey, mode)
  };
}

function applyThemeFromSettings() {
  if (!state.settings) {
    return;
  }

  const root = document.documentElement;
  const density = DENSITY_PRESETS[state.settings.density] || DENSITY_PRESETS.comfortable;
  const { mode, tokens: themeTokens } = resolveThemeTokens(state.settings);

  const cssTokenMap = {
    "--bg": themeTokens.bg,
    "--bg-elev": themeTokens.bgElev,
    "--text": themeTokens.text,
    "--text-muted": themeTokens.textMuted,
    "--border": themeTokens.border,
    "--row-hover": themeTokens.rowHover,
    "--row-active": themeTokens.rowActive,
    "--shadow": themeTokens.shadow,
    "--focus-ring": themeTokens.focusRing
  };

  for (const [key, value] of Object.entries(cssTokenMap)) {
    root.style.setProperty(key, value);
  }

  const accentColor = state.settings.accentColor || themeTokens.accent || DEFAULT_ACCENT;

  root.dataset.theme = mode;
  root.style.setProperty("--accent", accentColor);
  root.style.setProperty("--font-scale", String(state.settings.fontScale));
  root.style.setProperty("--indent", `${state.settings.indentPx}px`);
  root.style.setProperty("--radius", `${state.settings.radiusPx}px`);
  root.style.setProperty("--row-height", `${density.rowHeight}px`);
  root.style.setProperty("--node-gap", `${density.nodeGap}px`);
  root.style.setProperty("--tree-pad-y", `${density.treePadY}px`);
  root.style.setProperty("--child-pad", `${density.childPad}px`);
  root.style.setProperty("--topbar-pad-y", `${density.topbarPadY}px`);
}

function hydrateSettingsForm() {
  if (!state.settings || !dom.settingsForm) {
    return;
  }
  for (const element of dom.settingsForm.elements) {
    if (!element.name || !(element.name in state.settings)) {
      continue;
    }
    if (element.type === "checkbox") {
      element.checked = !!state.settings[element.name];
    } else {
      element.value = String(state.settings[element.name]);
    }
  }
}

async function applySettingsPatch(patch) {
  if (!state.settings || !patch || typeof patch !== "object") {
    return;
  }

  state.settings = {
    ...state.settings,
    ...patch
  };
  render();

  await send(MESSAGE_TYPES.PATCH_SETTINGS, {
    settingsPatch: patch
  });
}

async function resetSettingsSection(section) {
  const keys = SETTINGS_SECTION_KEYS[section];
  if (!Array.isArray(keys) || !state.settings) {
    return;
  }

  const patch = {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
      continue;
    }
    if (state.settings[key] !== DEFAULT_SETTINGS[key]) {
      patch[key] = DEFAULT_SETTINGS[key];
    }
  }

  if (!Object.keys(patch).length) {
    return;
  }
  await applySettingsPatch(patch);
}

function updateShortcutHint() {
  if (!state.settings?.shortcutHintsEnabled) {
    dom.hintBar.textContent = "";
    return;
  }
  dom.hintBar.textContent = t(
    "shortcutHintText",
    [],
    "Shift+Click selects range. Right-click for actions. Drag search bar to move to top-level."
  );
}

function resolveContextScopeTabIds(primaryTabId) {
  const tree = currentWindowTree();
  if (Number.isFinite(primaryTabId) && tree?.nodes[nodeId(primaryTabId)]) {
    const selected = selectedTabIdsArray()
      .filter((id) => Number.isFinite(id))
      .filter((id) => !!tree?.nodes[nodeId(id)]);

    if (selected.includes(primaryTabId)) {
      return Array.from(new Set(selected));
    }
    return [primaryTabId];
  }
  return [];
}

function contextMenuFocusables() {
  return Array.from(dom.contextMenu.querySelectorAll(".context-menu-item:not([disabled])"))
    .filter((el) => el.getClientRects().length > 0);
}

function focusFirstContextMenuItem() {
  const first = contextMenuFocusables()[0];
  if (first) {
    first.focus();
  } else {
    dom.contextMenu.focus();
  }
}

function positionContextMenu() {
  const menu = dom.contextMenu;
  if (!state.contextMenu.open) {
    return;
  }

  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - menu.offsetWidth - margin);
  const maxY = Math.max(margin, window.innerHeight - menu.offsetHeight - margin);
  const left = Math.min(Math.max(state.contextMenu.x, margin), maxX);
  const top = Math.min(Math.max(state.contextMenu.y, margin), maxY);

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function updateContextSubmenuDirection() {
  const submenus = Array.from(dom.contextMenu.querySelectorAll(".context-submenu"));
  for (const submenu of submenus) {
    submenu.classList.remove("context-submenu-left", "context-submenu-up");
    const panel = submenu.querySelector(".context-submenu-panel");
    if (!panel) {
      continue;
    }

    const submenuRect = submenu.getBoundingClientRect();
    const panelMinWidth = Number.parseFloat(getComputedStyle(panel).minWidth) || 120;
    const rightSpace = window.innerWidth - submenuRect.right - 8;
    const leftSpace = submenuRect.left - 8;
    const estimatedPanelWidth = Math.max(panelMinWidth, 120);

    if (rightSpace < estimatedPanelWidth && leftSpace >= rightSpace) {
      submenu.classList.add("context-submenu-left");
    }

    const estimatedItemHeight = 30;
    const estimatedPanelHeight = Math.max(120, panel.childElementCount * estimatedItemHeight + 10);
    const bottomSpace = window.innerHeight - submenuRect.top - 8;
    if (bottomSpace < estimatedPanelHeight) {
      submenu.classList.add("context-submenu-up");
    }
  }
}

function closeContextMenu() {
  if (!state.contextMenu.open) {
    return;
  }
  const shouldRestoreFocus = dom.contextMenu.contains(document.activeElement);
  const returnTabId = state.contextMenu.returnTabId;
  dom.contextMenu.hidden = true;
  dom.contextMenu.innerHTML = "";
  resetContextMenuState();
  if (shouldRestoreFocus && Number.isFinite(returnTabId)) {
    focusTreeRow(returnTabId);
  }
}

function openTabContextMenu(event, tabId) {
  event.preventDefault();
  event.stopPropagation();

  state.contextMenu = {
    open: true,
    kind: "tab",
    x: event.clientX,
    y: event.clientY,
    primaryTabId: tabId,
    scopeTabIds: resolveContextScopeTabIds(tabId),
    groupId: null,
    windowId: currentWindowTree()?.windowId || null,
    renameOpen: false,
    returnTabId: tabId
  };
  renderContextMenu();
}

function openGroupContextMenu(event, groupId, windowId) {
  event.preventDefault();
  event.stopPropagation();

  state.contextMenu = {
    open: true,
    kind: "group",
    x: event.clientX,
    y: event.clientY,
    primaryTabId: null,
    scopeTabIds: [],
    groupId,
    windowId,
    renameOpen: false,
    returnTabId: null
  };
  renderContextMenu();
}

async function copyTextToClipboard(text) {
  if (!text) {
    return;
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fallback below.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "absolute";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand("copy");
  } catch {
    // Best effort fallback.
  }
  textArea.remove();
}

function scopedUrls(tree, tabIds) {
  return tabIds
    .map((tabId) => tree.nodes[nodeId(tabId)]?.lastKnownUrl || "")
    .filter((url) => typeof url === "string" && url.trim().length > 0);
}

function groupTabIds(tree, groupId) {
  return Object.values(tree.nodes)
    .filter((node) => node.groupId === groupId)
    .map((node) => node.tabId)
    .filter((tabId) => Number.isFinite(tabId));
}

function orderedExistingGroups(tree) {
  const ordered = [];
  const seen = new Set();
  const { blocks } = rootBuckets(tree);

  for (const block of blocks) {
    if (block.type !== "group") {
      continue;
    }
    const group = tree.groups?.[block.groupId];
    if (!group || seen.has(group.id)) {
      continue;
    }
    const tabCount = groupTabIds(tree, group.id).length;
    ordered.push({
      id: group.id,
      title: group.title || t("unnamedGroup", [], "Unnamed group"),
      color: group.color,
      tabCount
    });
    seen.add(group.id);
  }

  for (const group of Object.values(tree.groups || {})) {
    if (!Number.isInteger(group?.id) || seen.has(group.id)) {
      continue;
    }
    const tabCount = groupTabIds(tree, group.id).length;
    ordered.push({
      id: group.id,
      title: group.title || t("unnamedGroup", [], "Unnamed group"),
      color: group.color,
      tabCount
    });
    seen.add(group.id);
  }

  return ordered;
}

async function executeContextMenuAction(action) {
  const tree = currentWindowTree();
  if (!tree) {
    return;
  }

  if (action === "rename-group") {
    state.contextMenu.renameOpen = true;
    renderContextMenu();
    return;
  }

  if (action === "close-group") {
    const tabIds = groupTabIds(tree, state.contextMenu.groupId);
    closeContextMenu();
    if (!tabIds.length) {
      return;
    }
    await requestClose(
      {
        kind: "batch-tabs",
        tabIds
      },
      tabIds.length,
      true
    );
    return;
  }

  if (action === "close-selected-tabs") {
    const tabIds = state.contextMenu.scopeTabIds;
    closeContextMenu();
    if (!tabIds.length) {
      return;
    }
    await requestClose(
      {
        kind: "batch-tabs",
        tabIds
      },
      tabIds.length,
      true
    );
    return;
  }

  if (action === "group-selected-new") {
    const tabIds = state.contextMenu.scopeTabIds;
    const hasGroupedTabs = tabIds.some((tabId) => tree.nodes[nodeId(tabId)]?.groupId !== null);
    closeContextMenu();
    if (!tabIds.length || hasGroupedTabs) {
      return;
    }
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.BATCH_GROUP_NEW,
      tabIds
    });
    return;
  }

  if (typeof action === "string" && action.startsWith("group-selected-existing:")) {
    const tabIds = state.contextMenu.scopeTabIds;
    const groupId = Number(action.slice("group-selected-existing:".length));
    const windowId = state.contextMenu.windowId;
    closeContextMenu();
    if (!tabIds.length || !Number.isInteger(groupId)) {
      return;
    }
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.BATCH_GROUP_EXISTING,
      tabIds,
      groupId,
      windowId
    });
    return;
  }

  if (action === "add-child") {
    const tabId = state.contextMenu.primaryTabId;
    closeContextMenu();
    if (!Number.isFinite(tabId)) {
      return;
    }
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.ADD_CHILD_TAB,
      parentTabId: tabId
    });
    return;
  }

  if (action === "move-selected-root") {
    const tabIds = state.contextMenu.scopeTabIds;
    closeContextMenu();
    if (!tabIds.length) {
      return;
    }
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.BATCH_MOVE_TO_ROOT,
      tabIds
    });
    return;
  }

  if (action === "toggle-collapse") {
    const tabId = state.contextMenu.primaryTabId;
    closeContextMenu();
    if (!Number.isFinite(tabId)) {
      return;
    }
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.TOGGLE_COLLAPSE,
      tabId
    });
    return;
  }

  if (action === "copy-urls") {
    const urls = scopedUrls(tree, state.contextMenu.scopeTabIds);
    closeContextMenu();
    if (!urls.length) {
      return;
    }
    await copyTextToClipboard(urls.join("\n"));
    return;
  }
}

async function submitGroupRename(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector("input[name='group-title']");
  if (!input) {
    closeContextMenu();
    return;
  }

  const groupId = state.contextMenu.groupId;
  const windowId = state.contextMenu.windowId;
  const title = input.value;
  closeContextMenu();

  await send(MESSAGE_TYPES.TREE_ACTION, {
    type: TREE_ACTIONS.RENAME_GROUP,
    groupId,
    windowId,
    title
  });
}

async function setGroupColor(color) {
  const groupId = state.contextMenu.groupId;
  const windowId = state.contextMenu.windowId;
  const tree = currentWindowTree();
  const tabIds = tree && Number.isInteger(groupId)
    ? groupTabIds(tree, groupId)
    : [];
  closeContextMenu();
  try {
    const response = await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.SET_GROUP_COLOR,
      groupId,
      windowId,
      color,
      tabIds
    });
    if (response?.ok === false) {
      throw new Error(response.error || "Unknown error");
    }
  } catch (error) {
    console.warn("Failed to sync native tab group color", error);
  }
}

function createContextMenuButton(label, action, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "context-menu-item";
  button.setAttribute("role", "menuitem");
  button.dataset.action = action;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    await executeContextMenuAction(action);
  });
  return button;
}

function createContextMenuSeparator() {
  const separator = document.createElement("div");
  separator.className = "context-menu-separator";
  separator.setAttribute("role", "separator");
  return separator;
}

function createContextMenuSectionLabel(label) {
  const section = document.createElement("div");
  section.className = "context-menu-section-label";
  section.textContent = label;
  return section;
}

function createExistingGroupMenuItem(group, disabled = false) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "context-menu-item context-group-item";
  item.setAttribute("role", "menuitem");
  item.dataset.action = `group-selected-existing:${group.id}`;
  item.dataset.groupId = String(group.id);
  item.disabled = !!disabled;

  const dot = document.createElement("span");
  dot.className = "context-color-dot context-group-dot";
  dot.style.setProperty("--group-color", GROUP_COLOR_MAP[group.color] || GROUP_COLOR_MAP.grey);

  const label = document.createElement("span");
  label.className = "context-group-label";
  label.textContent = group.title?.trim() || t("groupFallbackName", [String(group.id)], `Group ${group.id}`);

  const count = document.createElement("span");
  count.className = "context-group-count";
  count.textContent = String(group.tabCount);

  item.append(dot, label, count);
  item.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (item.disabled) {
      return;
    }
    await executeContextMenuAction(item.dataset.action);
  });

  return item;
}

function buildTabContextMenu(tree) {
  const fragment = document.createDocumentFragment();
  const primaryNode = tree.nodes[nodeId(state.contextMenu.primaryTabId)];
  const scopeTabIds = state.contextMenu.scopeTabIds;
  const closeCount = scopeTabIds.length;
  const hasGroupedTabs = scopeTabIds.some((tabId) => tree.nodes[nodeId(tabId)]?.groupId !== null);
  const existingGroups = orderedExistingGroups(tree);
  const inlineGroups = existingGroups.slice(0, CONTEXT_INLINE_GROUP_LIMIT);
  const overflowGroups = existingGroups.slice(CONTEXT_INLINE_GROUP_LIMIT);
  const canAssignExistingGroup = closeCount > 0;
  const closeLabel = closeCount === 0
    ? t("closeSelectedTabsGeneric", [], "Close selected tab(s)")
    : closeCount === 1
      ? t("closeSelectedTab", [], "Close selected tab")
      : t("closeSelectedTabsMany", [String(closeCount)], `Close ${closeCount} selected tabs`);
  const copyUrls = scopedUrls(tree, scopeTabIds);

  fragment.appendChild(
    createContextMenuButton(closeLabel, "close-selected-tabs", closeCount === 0)
  );
  fragment.appendChild(
    createContextMenuButton(
      t("addToNewTabGroup", [], "Add to new tab group"),
      "group-selected-new",
      closeCount === 0 || hasGroupedTabs
    )
  );

  if (existingGroups.length) {
    fragment.appendChild(createContextMenuSectionLabel(t("addToExistingTabGroup", [], "Add to existing tab group")));

    const inlineList = document.createElement("div");
    inlineList.className = "context-inline-group-list";
    for (const group of inlineGroups) {
      inlineList.appendChild(createExistingGroupMenuItem(group, !canAssignExistingGroup));
    }
    fragment.appendChild(inlineList);

    if (overflowGroups.length) {
      const moreGroupsSubmenu = document.createElement("div");
      moreGroupsSubmenu.className = "context-submenu context-inline-groups-more";

      const moreGroupsTrigger = document.createElement("button");
      moreGroupsTrigger.type = "button";
      moreGroupsTrigger.className = "context-menu-item context-submenu-trigger context-more-groups-trigger";
      moreGroupsTrigger.setAttribute("role", "menuitem");
      moreGroupsTrigger.textContent = t("moreGroups", [], "More groups...");
      moreGroupsTrigger.disabled = !canAssignExistingGroup;
      moreGroupsTrigger.setAttribute("aria-haspopup", "menu");
      moreGroupsTrigger.setAttribute("aria-expanded", "false");

      const moreGroupsPanel = document.createElement("div");
      moreGroupsPanel.id = "context-submenu-existing-more";
      moreGroupsPanel.className = "context-submenu-panel context-inline-groups-panel";
      moreGroupsPanel.setAttribute("role", "menu");
      moreGroupsTrigger.setAttribute("aria-controls", moreGroupsPanel.id);

      for (const group of overflowGroups) {
        moreGroupsPanel.appendChild(createExistingGroupMenuItem(group, !canAssignExistingGroup));
      }

      const openMoreGroups = () => {
        moreGroupsSubmenu.classList.add("open");
        moreGroupsTrigger.setAttribute("aria-expanded", "true");
        const first = moreGroupsPanel.querySelector(".context-menu-item:not([disabled])");
        if (first) {
          first.focus();
        }
      };

      moreGroupsTrigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (moreGroupsSubmenu.classList.contains("open")) {
          moreGroupsSubmenu.classList.remove("open");
          moreGroupsTrigger.setAttribute("aria-expanded", "false");
          return;
        }
        openMoreGroups();
      });

      moreGroupsTrigger.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowRight") {
          return;
        }
        event.preventDefault();
        openMoreGroups();
      });

      moreGroupsSubmenu.append(moreGroupsTrigger, moreGroupsPanel);
      fragment.appendChild(moreGroupsSubmenu);
    }
  } else {
    fragment.appendChild(
      createContextMenuButton(t("addToExistingTabGroup", [], "Add to existing tab group"), "noop", true)
    );
  }

  fragment.appendChild(createContextMenuSeparator());
  fragment.appendChild(
    createContextMenuButton(t("addChildTab", [], "Add child tab"), "add-child", !primaryNode)
  );
  fragment.appendChild(
    createContextMenuButton(t("moveSelectedToTopLevel", [], "Move selected to top-level"), "move-selected-root", closeCount === 0)
  );
  fragment.appendChild(
    createContextMenuButton(t("toggleCollapse", [], "Toggle collapse"), "toggle-collapse", !primaryNode?.childNodeIds?.length)
  );
  fragment.appendChild(
    createContextMenuButton(t("copyUrls", [], "Copy URL(s)"), "copy-urls", !copyUrls.length)
  );

  return fragment;
}

function buildGroupContextMenu(tree) {
  const fragment = document.createDocumentFragment();
  const groupId = state.contextMenu.groupId;
  const group = tree.groups?.[groupId];
  const groupExists = !!group;
  const closeTabIds = groupTabIds(tree, groupId);
  const closeLabel = closeTabIds.length <= 1
    ? t("closeTabGroup", [], "Close tab group")
    : t("closeTabGroupWithCount", [String(closeTabIds.length)], `Close tab group (${closeTabIds.length})`);

  if (!state.contextMenu.renameOpen) {
    fragment.appendChild(createContextMenuButton(t("renameGroup", [], "Rename group..."), "rename-group", !groupExists));
  } else {
    const form = document.createElement("form");
    form.className = "context-rename-form";
    form.addEventListener("submit", submitGroupRename);

    const input = document.createElement("input");
    input.className = "context-rename-input";
    input.name = "group-title";
    input.value = group?.title || "";
    input.placeholder = t("groupNamePlaceholder", [], "Group name");
    input.autocomplete = "off";
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeContextMenu();
      }
    });

    const apply = document.createElement("button");
    apply.type = "submit";
    apply.className = "context-rename-apply";
    apply.textContent = t("save", [], "Save");

    form.append(input, apply);
    fragment.appendChild(form);
  }

  if (groupExists) {
    fragment.appendChild(createContextMenuSectionLabel(t("color", [], "Color")));
    const colorGrid = document.createElement("div");
    colorGrid.className = "context-color-grid";
    colorGrid.setAttribute("role", "group");
    colorGrid.setAttribute("aria-label", t("color", [], "Color"));

    for (const option of GROUP_COLOR_OPTIONS) {
      const colorBtn = document.createElement("button");
      colorBtn.type = "button";
      colorBtn.className = "context-menu-item context-color-swatch";
      colorBtn.setAttribute("role", "menuitem");
      colorBtn.dataset.color = option.value;
      const label = t(option.labelKey, [], option.value);
      colorBtn.setAttribute("aria-label", t("setGroupColorTo", [label], `Set group color to ${label}`));
      colorBtn.title = t("setGroupColorTo", [label], `Set group color to ${label}`);
      if (group?.color === option.value) {
        colorBtn.classList.add("active");
      }
      colorBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        await setGroupColor(option.value);
      });

      const dot = document.createElement("span");
      dot.className = "context-color-dot";
      dot.style.setProperty("--group-color", GROUP_COLOR_MAP[option.value]);

      const text = document.createElement("span");
      text.className = "context-color-label";
      text.textContent = label;

      colorBtn.append(dot, text);
      colorGrid.appendChild(colorBtn);
    }
    fragment.appendChild(colorGrid);
  }

  fragment.appendChild(createContextMenuSeparator());
  fragment.appendChild(
    createContextMenuButton(closeLabel, "close-group", !groupExists || closeTabIds.length === 0)
  );

  return fragment;
}

function renderContextMenu() {
  if (!state.contextMenu.open) {
    dom.contextMenu.hidden = true;
    dom.contextMenu.innerHTML = "";
    return;
  }

  const tree = currentWindowTree();
  if (!tree) {
    closeContextMenu();
    return;
  }

  if (state.contextMenu.kind === "tab") {
    const validScope = state.contextMenu.scopeTabIds.filter((id) => !!tree.nodes[nodeId(id)]);
    state.contextMenu.scopeTabIds = validScope;
    if (!tree.nodes[nodeId(state.contextMenu.primaryTabId)]) {
      closeContextMenu();
      return;
    }
  }

  if (state.contextMenu.kind === "group" && !tree.groups?.[state.contextMenu.groupId]) {
    closeContextMenu();
    return;
  }

  dom.contextMenu.innerHTML = "";
  dom.contextMenu.hidden = false;
  dom.contextMenu.classList.toggle("context-menu-group", state.contextMenu.kind === "group");

  if (state.contextMenu.kind === "tab") {
    dom.contextMenu.appendChild(buildTabContextMenu(tree));
  } else if (state.contextMenu.kind === "group") {
    dom.contextMenu.appendChild(buildGroupContextMenu(tree));
  }

  positionContextMenu();
  updateContextSubmenuDirection();

  if (state.contextMenu.renameOpen) {
    const input = dom.contextMenu.querySelector(".context-rename-input");
    if (input) {
      input.focus();
      input.select();
    }
  } else {
    focusFirstContextMenuItem();
  }
}

async function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

function matchesSearch(node, query) {
  if (!query) {
    return true;
  }
  const haystack = `${node.lastKnownTitle || ""} ${node.lastKnownUrl || ""}`.toLowerCase();
  return haystack.includes(query);
}

function groupDisplay(tree, groupId) {
  const group = tree.groups?.[groupId] || null;
  return {
    name: group?.title?.trim() || t("groupFallbackName", [String(groupId)], `Group ${groupId}`),
    color: GROUP_COLOR_MAP[group?.color] || GROUP_COLOR_MAP.grey,
    collapsed: !!group?.collapsed
  };
}

function buildVisibilityMap(tree, query) {
  const visibility = new Map();
  if (!query) {
    return visibility;
  }

  const visit = (nodeKey) => {
    if (visibility.has(nodeKey)) {
      return visibility.get(nodeKey);
    }

    const node = tree.nodes[nodeKey];
    if (!node) {
      visibility.set(nodeKey, false);
      return false;
    }

    let childVisible = false;
    for (const childId of node.childNodeIds) {
      childVisible = visit(childId) || childVisible;
    }

    const visible = matchesSearch(node, query) || childVisible;
    visibility.set(nodeKey, visible);
    return visible;
  };

  for (const rootNodeId of tree.rootNodeIds) {
    visit(rootNodeId);
  }
  return visibility;
}

function shouldRenderNode(tree, nodeKey, query, visibilityByNodeId) {
  if (!query) {
    return !!tree.nodes[nodeKey];
  }
  return visibilityByNodeId.get(nodeKey) === true;
}

function isDescendant(tree, ancestorNodeId, maybeDescendantNodeId) {
  if (!ancestorNodeId || !maybeDescendantNodeId) {
    return false;
  }
  const stack = [...(tree.nodes[ancestorNodeId]?.childNodeIds || [])];
  while (stack.length) {
    const current = stack.pop();
    if (current === maybeDescendantNodeId) {
      return true;
    }
    stack.push(...(tree.nodes[current]?.childNodeIds || []));
  }
  return false;
}

function subtreeMaxIndex(tree, rootNodeId) {
  let max = tree.nodes[rootNodeId]?.index ?? 0;
  const stack = [...(tree.nodes[rootNodeId]?.childNodeIds || [])];
  while (stack.length) {
    const current = stack.pop();
    const node = tree.nodes[current];
    if (node) {
      max = Math.max(max, node.index ?? max);
      stack.push(...node.childNodeIds);
    }
  }
  return max;
}

function getDropPosition(event, row, options = {}) {
  const { allowInside = true } = options;
  const rect = row.getBoundingClientRect();
  const y = event.clientY - rect.top;
  if (y < rect.height * DROP_EDGE_RATIO) {
    return "before";
  }
  if (y > rect.height * (1 - DROP_EDGE_RATIO)) {
    return "after";
  }
  if (!allowInside) {
    return y < rect.height * 0.5 ? "before" : "after";
  }
  return "inside";
}

function emptyDragTarget() {
  return {
    kind: null,
    tabId: null,
    groupId: null,
    position: null,
    valid: false
  };
}

function sameDragTarget(a, b) {
  return a.kind === b.kind
    && a.tabId === b.tabId
    && a.groupId === b.groupId
    && a.position === b.position
    && a.valid === b.valid;
}

function dropClassesForTarget(target) {
  if (!target || target.kind === null || target.kind === "root") {
    return [];
  }
  if (!target.valid) {
    return ["drop-invalid"];
  }
  if (target.position === "before") {
    return ["drop-valid-before"];
  }
  if (target.position === "after") {
    return ["drop-valid-after"];
  }
  if (target.position === "inside") {
    return ["drop-valid-inside"];
  }
  return [];
}

function removeDropTargetClasses(element) {
  if (!element) {
    return;
  }
  element.classList.remove(...DROP_TARGET_CLASSES);
}

function resetInsideDropHover() {
  state.dragInsideHover.kind = null;
  state.dragInsideHover.id = null;
  state.dragInsideHover.since = 0;
}

function updateSearchDropAffordance() {
  const active = state.draggingTabIds.length > 0 && !Number.isInteger(state.draggingGroupId);
  const focused = active && state.dragTarget.kind === "root" && state.dragTarget.valid;
  dom.searchWrap.dataset.dropActive = active ? "true" : "false";
  dom.searchWrap.dataset.dropFocused = focused ? "true" : "false";
  dom.searchDropHint.hidden = !active;
}

function setDragTarget(target = null, element = null) {
  const next = target
    ? {
      kind: target.kind || null,
      tabId: Number.isFinite(target.tabId) ? target.tabId : null,
      groupId: Number.isInteger(target.groupId) ? target.groupId : null,
      position: target.position || null,
      valid: !!target.valid
    }
    : emptyDragTarget();

  if (sameDragTarget(state.dragTarget, next) && state.dragTargetElement === element) {
    updateSearchDropAffordance();
    return;
  }

  removeDropTargetClasses(state.dragTargetElement);
  state.dragTarget = next;
  state.dragTargetElement = element || null;

  if (state.dragTargetElement) {
    state.dragTargetElement.classList.add(...dropClassesForTarget(next));
  }

  updateSearchDropAffordance();
}

function clearDropClasses() {
  removeDropTargetClasses(state.dragTargetElement);
  state.dragTarget = emptyDragTarget();
  state.dragTargetElement = null;

  dom.treeRoot.querySelectorAll(".drop-valid-before, .drop-valid-after, .drop-valid-inside, .drop-invalid, .drop-before, .drop-after, .drop-inside, .group-drop-before, .group-drop-after")
    .forEach((el) => removeDropTargetClasses(el));

  updateSearchDropAffordance();
}

function maybeAutoScroll(clientY) {
  if (!state.draggingTabIds.length && !Number.isInteger(state.draggingGroupId)) {
    return;
  }

  state.dragAutoScroll.active = true;
  state.dragAutoScroll.clientY = clientY;

  if (state.dragAutoScroll.rafId) {
    return;
  }

  const tick = () => {
    state.dragAutoScroll.rafId = null;
    if (!state.dragAutoScroll.active) {
      return;
    }

    const rect = dom.treeRoot.getBoundingClientRect();
    const y = state.dragAutoScroll.clientY;
    let delta = 0;

    if (y < rect.top + AUTO_SCROLL_EDGE_PX) {
      const ratio = Math.min(1, (rect.top + AUTO_SCROLL_EDGE_PX - y) / AUTO_SCROLL_EDGE_PX);
      delta = -Math.ceil(ratio * AUTO_SCROLL_MAX_STEP);
    } else if (y > rect.bottom - AUTO_SCROLL_EDGE_PX) {
      const ratio = Math.min(1, (y - (rect.bottom - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX);
      delta = Math.ceil(ratio * AUTO_SCROLL_MAX_STEP);
    }

    if (delta !== 0) {
      dom.treeRoot.scrollTop += delta;
      state.dragAutoScroll.rafId = requestAnimationFrame(tick);
    }
  };

  state.dragAutoScroll.rafId = requestAnimationFrame(tick);
}

function stopAutoScroll() {
  state.dragAutoScroll.active = false;
  if (state.dragAutoScroll.rafId) {
    cancelAnimationFrame(state.dragAutoScroll.rafId);
    state.dragAutoScroll.rafId = null;
  }
}

function canActivateInsideDrop(kind, id) {
  const now = Date.now();
  if (state.dragInsideHover.kind !== kind || state.dragInsideHover.id !== id) {
    state.dragInsideHover.kind = kind;
    state.dragInsideHover.id = id;
    state.dragInsideHover.since = now;
    return false;
  }
  return now - state.dragInsideHover.since >= INSIDE_DROP_DWELL_MS;
}

function fallbackEdgePosition(event, row) {
  const rect = row.getBoundingClientRect();
  return event.clientY - rect.top < rect.height * 0.5 ? "before" : "after";
}

function resolveTabDropIntent(tree, row, targetTabId, event) {
  const candidate = getDropPosition(event, row, { allowInside: true });
  if (candidate !== "inside") {
    resetInsideDropHover();
    return {
      position: candidate,
      valid: canDrop(tree, state.draggingTabIds, targetTabId, candidate)
    };
  }

  if (!canDrop(tree, state.draggingTabIds, targetTabId, "inside")) {
    resetInsideDropHover();
    return {
      position: "inside",
      valid: false
    };
  }

  if (canActivateInsideDrop("tab", targetTabId)) {
    return {
      position: "inside",
      valid: true
    };
  }

  const fallback = fallbackEdgePosition(event, row);
  return {
    position: fallback,
    valid: canDrop(tree, state.draggingTabIds, targetTabId, fallback)
  };
}

function canDropGroup(tree, sourceGroupId, options = {}) {
  const { targetGroupId = null, targetTabId = null } = options;
  if (!Number.isInteger(sourceGroupId)) {
    return false;
  }
  const sourceHasRows = Object.values(tree.nodes).some((node) => node.groupId === sourceGroupId && !node.pinned);
  if (!sourceHasRows) {
    return false;
  }
  if (Number.isInteger(targetGroupId) && targetGroupId === sourceGroupId) {
    return false;
  }
  if (Number.isFinite(targetTabId)) {
    const targetNode = tree.nodes[nodeId(targetTabId)];
    if (!targetNode || targetNode.pinned || targetNode.parentNodeId) {
      return false;
    }
    if (targetNode.groupId === sourceGroupId) {
      return false;
    }
  }
  return true;
}

async function moveGroupBlockToTarget(tree, target, position) {
  if (!state.draggingGroupId || (position !== "before" && position !== "after")) {
    return;
  }
  const payload = {
    type: TREE_ACTIONS.MOVE_GROUP_BLOCK,
    sourceGroupId: state.draggingGroupId,
    windowId: tree.windowId,
    position
  };

  if (target.kind === "group") {
    payload.targetGroupId = target.groupId;
  } else if (target.kind === "tab") {
    payload.targetTabId = target.tabId;
  }

  await send(MESSAGE_TYPES.TREE_ACTION, payload);
}

function dedupeCloseRootNodeIds(tree, nodeIds) {
  const selected = new Set(nodeIds);
  return nodeIds.filter((id) => {
    let current = tree.nodes[id]?.parentNodeId || null;
    while (current) {
      if (selected.has(current)) {
        return false;
      }
      current = tree.nodes[current]?.parentNodeId || null;
    }
    return true;
  });
}

function subtreeTabIds(tree, rootNodeId) {
  const output = [];
  const stack = [rootNodeId];
  while (stack.length) {
    const currentId = stack.pop();
    const current = tree.nodes[currentId];
    if (!current) {
      continue;
    }
    output.push(current.tabId);
    stack.push(...current.childNodeIds);
  }
  return output;
}

function buildClosePlan(tree, tabIds) {
  const nodeIds = tabIds
    .map((tabId) => nodeId(tabId))
    .filter((id) => !!tree.nodes[id]);

  const roots = dedupeCloseRootNodeIds(tree, Array.from(new Set(nodeIds)));
  const allTabIds = new Set();
  for (const rootId of roots) {
    for (const tabId of subtreeTabIds(tree, rootId)) {
      allTabIds.add(tabId);
    }
  }

  return {
    rootTabIds: roots.map((id) => tree.nodes[id]?.tabId).filter((id) => Number.isFinite(id)),
    totalTabs: allTabIds.size
  };
}

function shouldConfirmClose(totalTabs, isBatch) {
  if (!state.settings || totalTabs < 2) {
    return false;
  }
  if (isBatch) {
    return !!state.settings.confirmCloseBatch;
  }
  return !!state.settings.confirmCloseSubtree;
}

async function executeCloseAction(action) {
  if (action.kind === "single") {
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.CLOSE_SUBTREE,
      tabId: action.tabId,
      includeDescendants: action.includeDescendants ?? true
    });
    return;
  }

  if (action.kind === "batch-tabs") {
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.BATCH_CLOSE_TABS,
      tabIds: action.tabIds
    });
    replaceSelection([], null);
    return;
  }

  if (action.kind === "batch") {
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.BATCH_CLOSE_SUBTREES,
      tabIds: action.tabIds
    });
    replaceSelection([], null);
  }
}

async function requestClose(action, totalTabs, isBatch) {
  if (!shouldConfirmClose(totalTabs, isBatch)) {
    await executeCloseAction(action);
    return;
  }

  state.pendingCloseAction = { action, isBatch };
  state.confirmReturnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dom.confirmMessage.textContent = t(
    "confirmCloseMessage",
    [String(totalTabs)],
    `This will close ${totalTabs} tabs. Continue?`
  );
  dom.confirmSkip.checked = false;
  dom.confirmOverlay.hidden = false;
  queueMicrotask(() => {
    dom.confirmCancel.focus();
  });
}

function closeConfirmDialog() {
  state.pendingCloseAction = null;
  dom.confirmOverlay.hidden = true;
  dom.confirmSkip.checked = false;
  if (state.confirmReturnFocusEl?.isConnected) {
    state.confirmReturnFocusEl.focus();
  }
  state.confirmReturnFocusEl = null;
}

function closeSettingsPanel() {
  dom.settingsPanel.hidden = true;
  if (state.settingsReturnFocusEl?.isConnected) {
    state.settingsReturnFocusEl.focus();
  }
  state.settingsReturnFocusEl = null;
}

function canDrop(tree, sourceTabIds, targetTabId, position) {
  const targetNodeId = nodeId(targetTabId);
  const targetNode = tree.nodes[targetNodeId];
  if (!targetNode) {
    return false;
  }

  const sourceNodeIds = sourceTabIds.map((tabId) => nodeId(tabId));
  if (sourceNodeIds.includes(targetNodeId)) {
    return false;
  }

  let newParentNodeId = null;
  if (position === "inside") {
    newParentNodeId = targetNodeId;
  } else {
    newParentNodeId = targetNode.parentNodeId;
  }

  const expectedPinned = (() => {
    if (newParentNodeId) {
      return !!tree.nodes[newParentNodeId]?.pinned;
    }
    return !!targetNode.pinned;
  })();

  for (const sourceNodeId of sourceNodeIds) {
    const sourceNode = tree.nodes[sourceNodeId];
    if (!sourceNode) {
      return false;
    }

    if (newParentNodeId && isDescendant(tree, sourceNodeId, newParentNodeId)) {
      return false;
    }

    if (!!sourceNode.pinned !== expectedPinned) {
      return false;
    }
  }

  return true;
}

function buildDropPayload(tree, sourceTabIds, targetTabId, position) {
  const targetNodeId = nodeId(targetTabId);
  const target = tree.nodes[targetNodeId];
  if (!target) {
    return null;
  }

  if (sourceTabIds.length > 1) {
    if (position === "inside") {
      return {
        type: TREE_ACTIONS.BATCH_REPARENT,
        tabIds: sourceTabIds,
        newParentTabId: target.tabId
      };
    }
    if (target.parentNodeId) {
      return {
        type: TREE_ACTIONS.BATCH_REPARENT,
        tabIds: sourceTabIds,
        newParentTabId: tree.nodes[target.parentNodeId]?.tabId || null
      };
    }
    return {
      type: TREE_ACTIONS.BATCH_MOVE_TO_ROOT,
      tabIds: sourceTabIds
    };
  }

  const sourceTabId = sourceTabIds[0];
  const sourceNodeId = nodeId(sourceTabId);
  const source = tree.nodes[sourceNodeId];
  if (!source) {
    return null;
  }

  if (position === "inside") {
    return {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: sourceTabId,
      targetTabId,
      newParentTabId: target.tabId,
      newIndex: target.childNodeIds.length,
      browserIndex: subtreeMaxIndex(tree, targetNodeId) + 1
    };
  }

  const parentNodeId = target.parentNodeId;
  const siblings = parentNodeId ? tree.nodes[parentNodeId]?.childNodeIds || [] : tree.rootNodeIds;
  let newIndex = siblings.indexOf(targetNodeId);
  if (position === "after") {
    newIndex += 1;
  }

  const oldIndexInSameList = siblings.indexOf(sourceNodeId);
  if (oldIndexInSameList >= 0 && oldIndexInSameList < newIndex) {
    newIndex -= 1;
  }

  const browserIndex = target.index + (position === "after" ? 1 : 0);

  if (parentNodeId) {
    return {
      type: TREE_ACTIONS.REPARENT_TAB,
      tabId: sourceTabId,
      targetTabId,
      newParentTabId: tree.nodes[parentNodeId]?.tabId || null,
      newIndex,
      browserIndex
    };
  }

  return {
    type: TREE_ACTIONS.MOVE_TO_ROOT,
    tabId: sourceTabId,
    index: newIndex,
    browserIndex
  };
}

async function dropToRoot(tree) {
  if (!state.draggingTabIds.length) {
    return;
  }

  if (state.draggingTabIds.length > 1) {
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.BATCH_MOVE_TO_ROOT,
      tabIds: [...state.draggingTabIds]
    });
  } else {
    const tabId = state.draggingTabIds[0];
    const draggingNode = tree.nodes[nodeId(tabId)];
    if (!draggingNode) {
      state.draggingTabIds = [];
      resetInsideDropHover();
      clearDropClasses();
      return;
    }

    const maxBrowserIndex = Math.max(
      0,
      ...Object.values(tree.nodes)
        .filter((n) => !!n.pinned === !!draggingNode.pinned)
        .map((n) => n.index)
    );

    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.MOVE_TO_ROOT,
      tabId,
      browserIndex: maxBrowserIndex + 1
    });
  }

  state.draggingTabIds = [];
  resetInsideDropHover();
  stopAutoScroll();
  clearDropClasses();
}

async function onRowClicked(event, tabId) {
  state.focusedTabId = tabId;
  const isToggle = event.metaKey || event.ctrlKey;

  if (event.shiftKey) {
    selectRangeTo(tabId);
    syncRenderedSelectionState();
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.ACTIVATE_TAB,
      tabId
    });
    return;
  }

  if (isToggle) {
    toggleSelection(tabId);
    syncRenderedSelectionState();
    return;
  }

  replaceSelection([tabId], tabId);
  syncRenderedSelectionState();
  await send(MESSAGE_TYPES.TREE_ACTION, {
    type: TREE_ACTIONS.ACTIVATE_TAB,
    tabId
  });
}

function createNodeRow(tree, node, options = {}) {
  const { showGroupBadge = true, depth = 1, siblingIndex = null, siblingCount = null } = options;
  const row = document.createElement("div");
  row.className = "tree-row";
  row.dataset.tabId = String(node.tabId);
  row.dataset.nodeId = nodeId(node.tabId);
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-expanded", node.childNodeIds.length ? String(!node.collapsed) : "false");
  row.setAttribute("aria-selected", state.selectedTabIds.has(node.tabId) ? "true" : "false");
  row.setAttribute("aria-level", String(depth));
  if (Number.isFinite(siblingIndex) && Number.isFinite(siblingCount)) {
    row.setAttribute("aria-posinset", String(siblingIndex + 1));
    row.setAttribute("aria-setsize", String(siblingCount));
  }
  row.tabIndex = -1;
  row.draggable = true;

  if (tree.selectedTabId === node.tabId) {
    row.classList.add("active");
  }
  if (state.selectedTabIds.has(node.tabId)) {
    row.classList.add("selected");
  }
  if (node.pinned) {
    row.classList.add("pinned-row");
    row.title = node.lastKnownTitle || t("pinnedTabTitle", [], "Pinned tab");
  }

  const twisty = document.createElement("button");
  twisty.className = "twisty";
  twisty.textContent = node.childNodeIds.length ? (node.collapsed ? "▸" : "▾") : "";
  twisty.title = node.childNodeIds.length ? t("toggleChildren", [], "Toggle children") : "";
  twisty.setAttribute("aria-label", t("toggleChildren", [], "Toggle children"));
  twisty.dataset.action = "toggle-collapse";

  const favicon = document.createElement("img");
  favicon.className = "favicon";
  favicon.alt = "";
  const shouldShowFavicon = node.pinned || state.settings?.showFavicons;
  const rawUrl = shouldShowFavicon ? node.favIconUrl || "" : "";
  const safeUrl = rawUrl && !rawUrl.startsWith("chrome://") && !rawUrl.startsWith("chrome-extension://")
    ? rawUrl : "";
  favicon.src = safeUrl;
  favicon.style.visibility = safeUrl ? "visible" : "hidden";
  if (safeUrl) {
    favicon.addEventListener("error", () => {
      favicon.style.visibility = "hidden";
      favicon.removeAttribute("src");
    }, { once: true });
  }

  const titleWrap = document.createElement("div");
  titleWrap.className = "title-wrap";
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = node.lastKnownTitle || t("untitledTab", [], "Untitled tab");
  titleWrap.appendChild(title);

  const badges = document.createElement("span");
  badges.className = "badges";
  if (showGroupBadge && node.groupId !== null) {
    const group = groupDisplay(tree, node.groupId);
    const groupBadge = document.createElement("span");
    groupBadge.className = "badge badge-group";
    groupBadge.style.setProperty("--group-color", group.color);
    groupBadge.textContent = group.name;
    badges.appendChild(groupBadge);
  }
  if (badges.childNodes.length && !node.pinned) {
    titleWrap.appendChild(badges);
  }

  const actions = document.createElement("div");
  actions.className = "node-actions";

  const addChild = document.createElement("button");
  addChild.className = "icon-btn";
  addChild.textContent = "+";
  addChild.title = t("addChildTab", [], "Add child tab");
  addChild.setAttribute("aria-label", t("addChildTab", [], "Add child tab"));
  addChild.dataset.action = "add-child";
  actions.appendChild(addChild);

  if (state.settings?.showCloseButton) {
    const closesSubtree = node.childNodeIds.length > 0 && !!node.collapsed;
    const close = document.createElement("button");
    close.className = "icon-btn";
    close.textContent = "×";
    close.title = closesSubtree
      ? t("closeSubtree", [], "Close subtree")
      : t("closeTab", [], "Close tab");
    close.setAttribute("aria-label", closesSubtree
      ? t("closeSubtree", [], "Close subtree")
      : t("closeTab", [], "Close tab"));
    close.dataset.action = "close-tab";
    actions.appendChild(close);
  }

  row.append(twisty, favicon, titleWrap, actions);
  return row;
}

function createNodeElement(tree, nodeKey, query, visibilityByNodeId, rowOptions = {}) {
  if (!shouldRenderNode(tree, nodeKey, query, visibilityByNodeId)) {
    return null;
  }

  const node = tree.nodes[nodeKey];
  if (!node) {
    return null;
  }

  const depth = Number.isFinite(rowOptions.depth) ? rowOptions.depth : 1;
  const holder = document.createElement("div");
  holder.className = "tree-node";
  holder.dataset.treeKey = `node:${node.tabId}`;
  holder.appendChild(createNodeRow(tree, node, { ...rowOptions, depth }));

  if (node.childNodeIds.length && (!node.collapsed || !!query)) {
    const children = document.createElement("div");
    children.className = "children";
    children.setAttribute("role", "group");
    const renderableChildIds = node.childNodeIds
      .filter((childId) => shouldRenderNode(tree, childId, query, visibilityByNodeId));
    for (const [childIndex, childId] of renderableChildIds.entries()) {
      const childEl = createNodeElement(tree, childId, query, visibilityByNodeId, {
        ...rowOptions,
        depth: depth + 1,
        siblingIndex: childIndex,
        siblingCount: renderableChildIds.length
      });
      if (childEl) {
        children.appendChild(childEl);
      }
    }
    if (children.childElementCount > 0) {
      holder.appendChild(children);
    }
  }

  return holder;
}

function createPinnedStrip(tree, pinnedRootNodeIds, query, visibilityByNodeId) {
  const section = document.createElement("section");
  section.className = "pinned-strip";

  const track = document.createElement("div");
  track.className = "pinned-track";

  let renderedCount = 0;
  const renderablePinnedIds = pinnedRootNodeIds
    .filter((nodeKey) => shouldRenderNode(tree, nodeKey, query, visibilityByNodeId));
  for (const [pinnedIndex, nodeKey] of renderablePinnedIds.entries()) {
    const node = tree.nodes[nodeKey];
    if (!node) {
      continue;
    }
    const row = createNodeRow(tree, node, {
      showGroupBadge: true,
      siblingIndex: pinnedIndex,
      siblingCount: renderablePinnedIds.length
    });
    track.appendChild(row);
    renderedCount += 1;
  }

  if (!renderedCount) {
    return { element: null, renderedCount: 0 };
  }

  section.appendChild(track);
  return { element: section, renderedCount };
}

function createGroupSection(tree, groupId, rootNodeIds, query, visibilityByNodeId) {
  const group = groupDisplay(tree, groupId);
  const queryMatch = query && group.name.toLowerCase().includes(query);

  const renderableRootIds = rootNodeIds
    .filter((nodeKey) => shouldRenderNode(tree, nodeKey, query, visibilityByNodeId));

  const renderedChildren = [];
  for (const [groupIndex, nodeKey] of renderableRootIds.entries()) {
    const child = createNodeElement(tree, nodeKey, query, visibilityByNodeId, {
      showGroupBadge: false,
      siblingIndex: groupIndex,
      siblingCount: renderableRootIds.length
    });
    if (child) {
      renderedChildren.push(child);
    }
  }

  if (!renderedChildren.length && !queryMatch) {
    return null;
  }

  const section = document.createElement("section");
  section.className = "group-section";
  section.dataset.treeKey = `group:${groupId}`;
  section.style.setProperty("--group-color", group.color);

  const header = document.createElement("div");
  header.className = "group-header";
  header.dataset.groupId = String(groupId);
  header.dataset.windowId = String(tree.windowId);
  header.setAttribute("role", "button");
  header.setAttribute("tabindex", "0");
  header.setAttribute("aria-expanded", String(!group.collapsed));
  header.title = group.collapsed
    ? t("expandGroup", [], "Expand group")
    : t("collapseGroup", [], "Collapse group");
  header.draggable = true;

  const colorDot = document.createElement("span");
  colorDot.className = "group-color-dot";

  const name = document.createElement("span");
  name.className = "group-name";
  name.textContent = group.name;

  const count = document.createElement("span");
  count.className = "group-count";
  count.textContent = String(groupTabIds(tree, groupId).length);

  header.append(colorDot, name, count);
  section.appendChild(header);

  const subtree = document.createElement("div");
  subtree.className = "group-children";
  if (group.collapsed && !query) {
    subtree.hidden = true;
  }
  for (const child of renderedChildren) {
    subtree.appendChild(child);
  }
  section.appendChild(subtree);

  return section;
}

function rootBuckets(tree) {
  const pinned = [];
  const blocks = [];
  const groupBlockById = new Map();

  for (const rootNodeId of tree.rootNodeIds) {
    const node = tree.nodes[rootNodeId];
    if (!node) {
      continue;
    }
    if (node.pinned) {
      pinned.push(rootNodeId);
      continue;
    }
    if (state.settings?.showGroupHeaders && node.groupId !== null) {
      if (!groupBlockById.has(node.groupId)) {
        const block = {
          type: "group",
          groupId: node.groupId,
          rootNodeIds: []
        };
        groupBlockById.set(node.groupId, block);
        blocks.push(block);
      }
      groupBlockById.get(node.groupId).rootNodeIds.push(rootNodeId);
      continue;
    }
    blocks.push({
      type: "node",
      rootNodeId
    });
  }

  return { pinned, blocks };
}

function safeFaviconUrl(node) {
  const shouldShow = node.pinned || state.settings?.showFavicons;
  const rawUrl = shouldShow ? node.favIconUrl || "" : "";
  return rawUrl && !rawUrl.startsWith("chrome://") && !rawUrl.startsWith("chrome-extension://")
    ? rawUrl : "";
}

function patchNodeRow(row, tree, node, options = {}) {
  const { showGroupBadge = true, depth = 1, siblingIndex = null, siblingCount = null } = options;

  row.classList.toggle("active", tree.selectedTabId === node.tabId);
  row.classList.toggle("selected", state.selectedTabIds.has(node.tabId));
  row.setAttribute("aria-expanded", node.childNodeIds.length ? String(!node.collapsed) : "false");
  row.setAttribute("aria-selected", state.selectedTabIds.has(node.tabId) ? "true" : "false");
  row.setAttribute("aria-level", String(depth));
  if (Number.isFinite(siblingIndex) && Number.isFinite(siblingCount)) {
    row.setAttribute("aria-posinset", String(siblingIndex + 1));
    row.setAttribute("aria-setsize", String(siblingCount));
  }

  const twisty = row.querySelector(".twisty");
  if (twisty) {
    const twistyText = node.childNodeIds.length ? (node.collapsed ? "▸" : "▾") : "";
    if (twisty.textContent !== twistyText) {
      twisty.textContent = twistyText;
    }
  }

  const favicon = row.querySelector(".favicon");
  if (favicon) {
    const safeUrl = safeFaviconUrl(node);
    if (favicon.getAttribute("src") !== safeUrl) {
      favicon.src = safeUrl;
      favicon.style.visibility = safeUrl ? "visible" : "hidden";
      if (safeUrl) {
        favicon.addEventListener("error", () => {
          favicon.style.visibility = "hidden";
          favicon.removeAttribute("src");
        }, { once: true });
      }
    }
  }

  const title = row.querySelector(".title");
  if (title) {
    const titleText = node.lastKnownTitle || t("untitledTab", [], "Untitled tab");
    if (title.textContent !== titleText) {
      title.textContent = titleText;
    }
  }

  if (node.pinned) {
    row.title = node.lastKnownTitle || t("pinnedTabTitle", [], "Pinned tab");
  }

  const badges = row.querySelector(".badges");
  if (badges && !node.pinned) {
    badges.innerHTML = "";
    if (showGroupBadge && node.groupId !== null) {
      const group = groupDisplay(tree, node.groupId);
      const groupBadge = document.createElement("span");
      groupBadge.className = "badge badge-group";
      groupBadge.style.setProperty("--group-color", group.color);
      groupBadge.textContent = group.name;
      badges.appendChild(groupBadge);
    }
  }

  const closeBtn = row.querySelector("[data-action='close-tab']");
  if (closeBtn) {
    const closesSubtree = node.childNodeIds.length > 0 && !!node.collapsed;
    closeBtn.title = closesSubtree
      ? t("closeSubtree", [], "Close subtree")
      : t("closeTab", [], "Close tab");
    closeBtn.setAttribute("aria-label", closeBtn.title);
  }
}

function patchNodeElement(existingHolder, tree, nodeKey, query, visibilityByNodeId, rowOptions = {}) {
  const node = tree.nodes[nodeKey];
  if (!node) {
    return;
  }

  const depth = Number.isFinite(rowOptions.depth) ? rowOptions.depth : 1;
  const row = existingHolder.querySelector(":scope > .tree-row");
  if (row) {
    patchNodeRow(row, tree, node, { ...rowOptions, depth });
  }

  const childContainer = existingHolder.querySelector(":scope > .children");
  const shouldShowChildren = node.childNodeIds.length && (!node.collapsed || !!query);

  if (!shouldShowChildren) {
    if (childContainer) {
      childContainer.remove();
    }
    return;
  }

  const renderableChildIds = node.childNodeIds
    .filter((childId) => shouldRenderNode(tree, childId, query, visibilityByNodeId));

  if (!renderableChildIds.length) {
    if (childContainer) {
      childContainer.remove();
    }
    return;
  }

  const container = childContainer || document.createElement("div");
  if (!childContainer) {
    container.className = "children";
    container.setAttribute("role", "group");
    existingHolder.appendChild(container);
  }

  reconcileChildren(container, tree, renderableChildIds, query, visibilityByNodeId, {
    ...rowOptions,
    depth: depth + 1,
    siblingCount: renderableChildIds.length
  });
}

function reconcileChildren(container, tree, desiredNodeKeys, query, visibilityByNodeId, rowOptions) {
  const existingByKey = new Map();
  for (const child of Array.from(container.children)) {
    const key = child.dataset.treeKey;
    if (key) {
      existingByKey.set(key, child);
    }
  }

  const desiredKeys = new Set();
  const orderedElements = [];

  for (const [index, nodeKey] of desiredNodeKeys.entries()) {
    const node = tree.nodes[nodeKey];
    if (!node) {
      continue;
    }
    const key = `node:${node.tabId}`;
    desiredKeys.add(key);

    const existing = existingByKey.get(key);
    if (existing) {
      patchNodeElement(existing, tree, nodeKey, query, visibilityByNodeId, {
        ...rowOptions,
        siblingIndex: index
      });
      orderedElements.push(existing);
    } else {
      const newEl = createNodeElement(tree, nodeKey, query, visibilityByNodeId, {
        ...rowOptions,
        siblingIndex: index
      });
      if (newEl) {
        orderedElements.push(newEl);
      }
    }
  }

  for (const [key, el] of existingByKey) {
    if (!desiredKeys.has(key)) {
      el.remove();
    }
  }

  for (let i = 0; i < orderedElements.length; i++) {
    const el = orderedElements[i];
    if (container.children[i] !== el) {
      container.insertBefore(el, container.children[i] || null);
    }
  }
}

function reconcilePinnedTrack(track, tree, desiredNodeKeys, query, visibilityByNodeId) {
  const existingByTabId = new Map();
  for (const child of Array.from(track.children)) {
    const tabId = child.dataset.tabId;
    if (tabId) {
      existingByTabId.set(tabId, child);
    }
  }

  const desiredTabIds = new Set();
  const orderedElements = [];

  for (const [index, nodeKey] of desiredNodeKeys.entries()) {
    const node = tree.nodes[nodeKey];
    if (!node) {
      continue;
    }
    const tabId = String(node.tabId);
    desiredTabIds.add(tabId);

    const existing = existingByTabId.get(tabId);
    if (existing) {
      patchNodeRow(existing, tree, node, {
        showGroupBadge: true,
        siblingIndex: index,
        siblingCount: desiredNodeKeys.length
      });
      orderedElements.push(existing);
    } else {
      const row = createNodeRow(tree, node, {
        showGroupBadge: true,
        siblingIndex: index,
        siblingCount: desiredNodeKeys.length
      });
      orderedElements.push(row);
    }
  }

  for (const [tabId, el] of existingByTabId) {
    if (!desiredTabIds.has(tabId)) {
      el.remove();
    }
  }

  for (let i = 0; i < orderedElements.length; i++) {
    const el = orderedElements[i];
    if (track.children[i] !== el) {
      track.insertBefore(el, track.children[i] || null);
    }
  }
}

function patchGroupSection(existingSection, tree, groupId, rootNodeIds, query, visibilityByNodeId) {
  const group = groupDisplay(tree, groupId);
  existingSection.style.setProperty("--group-color", group.color);

  const header = existingSection.querySelector(":scope > .group-header");
  if (header) {
    header.setAttribute("aria-expanded", String(!group.collapsed));
    header.title = group.collapsed
      ? t("expandGroup", [], "Expand group")
      : t("collapseGroup", [], "Collapse group");
    header.dataset.windowId = String(tree.windowId);

    const nameEl = header.querySelector(".group-name");
    if (nameEl && nameEl.textContent !== group.name) {
      nameEl.textContent = group.name;
    }

    const countEl = header.querySelector(".group-count");
    const countText = String(groupTabIds(tree, groupId).length);
    if (countEl && countEl.textContent !== countText) {
      countEl.textContent = countText;
    }
  }

  const subtree = existingSection.querySelector(":scope > .group-children");
  if (subtree) {
    subtree.hidden = group.collapsed && !query;

    const renderableRootIds = rootNodeIds
      .filter((nodeKey) => shouldRenderNode(tree, nodeKey, query, visibilityByNodeId));

    reconcileChildren(subtree, tree, renderableRootIds, query, visibilityByNodeId, {
      showGroupBadge: false,
      siblingCount: renderableRootIds.length
    });
  }
}

function shouldFullRebuild(tree) {
  if (!tree) {
    return true;
  }
  if (dom.treeRoot.children.length === 0) {
    return true;
  }
  if (state.lastRenderedWindowId !== tree.windowId) {
    return true;
  }
  if (state.lastRenderedShowGroupHeaders !== !!state.settings?.showGroupHeaders) {
    return true;
  }
  if (state.lastRenderedShowFavicons !== !!state.settings?.showFavicons) {
    return true;
  }
  if (state.lastRenderedShowCloseButton !== !!state.settings?.showCloseButton) {
    return true;
  }
  return false;
}

function updateLastRenderedState(tree) {
  state.lastRenderedWindowId = tree ? tree.windowId : null;
  state.lastRenderedShowGroupHeaders = !!state.settings?.showGroupHeaders;
  state.lastRenderedShowFavicons = !!state.settings?.showFavicons;
  state.lastRenderedShowCloseButton = !!state.settings?.showCloseButton;
}

function fullRebuildTree() {
  dom.treeRoot.innerHTML = "";
  dom.treeRoot.classList.toggle("hide-favicons", !state.settings?.showFavicons);
  state.visibleTabIds = [];
  const tree = currentWindowTree();
  if (!tree) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("noTabsAvailable", [], "No tabs available.");
    dom.treeRoot.appendChild(empty);
    state.focusedTabId = null;
    updateLastRenderedState(null);
    return;
  }

  const query = state.search.trim().toLowerCase();
  const visibilityByNodeId = buildVisibilityMap(tree, query);
  const { pinned, blocks } = rootBuckets(tree);

  let renderedCount = 0;

  if (pinned.length) {
    const pinLabel = document.createElement("div");
    pinLabel.className = "section-title";
    pinLabel.dataset.treeKey = "pinned-label";
    pinLabel.textContent = t("sectionPinned", [], "Pinned");
    dom.treeRoot.appendChild(pinLabel);
    const { element, renderedCount: pinnedCount } = createPinnedStrip(tree, pinned, query, visibilityByNodeId);
    if (element) {
      element.dataset.treeKey = "pinned-strip";
      dom.treeRoot.appendChild(element);
      renderedCount += pinnedCount;
    }
  }

  const rootNodeBlocks = blocks.filter((block) => block.type === "node");
  const renderableRootNodeIds = rootNodeBlocks
    .map((block) => block.rootNodeId)
    .filter((nodeIdKey) => shouldRenderNode(tree, nodeIdKey, query, visibilityByNodeId));
  let renderableRootNodeCursor = 0;

  for (const block of blocks) {
    if (block.type === "group") {
      const section = createGroupSection(tree, block.groupId, block.rootNodeIds, query, visibilityByNodeId);
      if (section) {
        dom.treeRoot.appendChild(section);
        renderedCount += 1;
      }
      continue;
    }

    const isRenderable = shouldRenderNode(tree, block.rootNodeId, query, visibilityByNodeId);
    const siblingIndex = isRenderable ? renderableRootNodeCursor : null;
    if (isRenderable) {
      renderableRootNodeCursor += 1;
    }
    const el = createNodeElement(tree, block.rootNodeId, query, visibilityByNodeId, {
      showGroupBadge: true,
      siblingIndex,
      siblingCount: renderableRootNodeIds.length
    });
    if (el) {
      dom.treeRoot.appendChild(el);
      renderedCount += 1;
    }
  }

  if (!renderedCount) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = query
      ? t("noTabsMatchSearch", [], "No tabs match your search.")
      : t("noTabsInWindow", [], "No tabs in this window.");
    dom.treeRoot.appendChild(empty);
  }

  updateLastRenderedState(tree);
  refreshVisibleTabIds();
  setTreeRowTabStop();
}

function patchTree() {
  const tree = currentWindowTree();
  dom.treeRoot.classList.toggle("hide-favicons", !state.settings?.showFavicons);

  if (!tree) {
    dom.treeRoot.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("noTabsAvailable", [], "No tabs available.");
    dom.treeRoot.appendChild(empty);
    state.focusedTabId = null;
    updateLastRenderedState(null);
    return;
  }

  const query = state.search.trim().toLowerCase();
  const visibilityByNodeId = buildVisibilityMap(tree, query);
  const { pinned, blocks } = rootBuckets(tree);

  const existingByKey = new Map();
  for (const child of Array.from(dom.treeRoot.children)) {
    const key = child.dataset?.treeKey;
    if (key) {
      existingByKey.set(key, child);
    }
  }

  const desiredKeys = [];
  const desiredElements = new Map();

  if (pinned.length) {
    const labelKey = "pinned-label";
    desiredKeys.push(labelKey);
    const existingLabel = existingByKey.get(labelKey);
    if (existingLabel) {
      desiredElements.set(labelKey, existingLabel);
    } else {
      const pinLabel = document.createElement("div");
      pinLabel.className = "section-title";
      pinLabel.dataset.treeKey = labelKey;
      pinLabel.textContent = t("sectionPinned", [], "Pinned");
      desiredElements.set(labelKey, pinLabel);
    }

    const stripKey = "pinned-strip";
    desiredKeys.push(stripKey);
    const existingStrip = existingByKey.get(stripKey);
    if (existingStrip) {
      const track = existingStrip.querySelector(".pinned-track");
      if (track) {
        const renderablePinnedIds = pinned
          .filter((nodeKey) => shouldRenderNode(tree, nodeKey, query, visibilityByNodeId));
        reconcilePinnedTrack(track, tree, renderablePinnedIds, query, visibilityByNodeId);
      }
      desiredElements.set(stripKey, existingStrip);
    } else {
      const { element } = createPinnedStrip(tree, pinned, query, visibilityByNodeId);
      if (element) {
        element.dataset.treeKey = stripKey;
        desiredElements.set(stripKey, element);
      }
    }
  }

  const rootNodeBlocks = blocks.filter((block) => block.type === "node");
  const renderableRootNodeIds = rootNodeBlocks
    .map((block) => block.rootNodeId)
    .filter((nodeIdKey) => shouldRenderNode(tree, nodeIdKey, query, visibilityByNodeId));
  let renderableRootNodeCursor = 0;

  for (const block of blocks) {
    if (block.type === "group") {
      const key = `group:${block.groupId}`;
      desiredKeys.push(key);
      const existing = existingByKey.get(key);
      if (existing) {
        patchGroupSection(existing, tree, block.groupId, block.rootNodeIds, query, visibilityByNodeId);
        desiredElements.set(key, existing);
      } else {
        const section = createGroupSection(tree, block.groupId, block.rootNodeIds, query, visibilityByNodeId);
        if (section) {
          desiredElements.set(key, section);
        }
      }
      continue;
    }

    const nodeKey = block.rootNodeId;
    const node = tree.nodes[nodeKey];
    if (!node) {
      continue;
    }

    const isRenderable = shouldRenderNode(tree, nodeKey, query, visibilityByNodeId);
    if (!isRenderable) {
      continue;
    }

    const siblingIndex = renderableRootNodeCursor;
    renderableRootNodeCursor += 1;

    const key = `node:${node.tabId}`;
    desiredKeys.push(key);
    const existing = existingByKey.get(key);
    if (existing) {
      patchNodeElement(existing, tree, nodeKey, query, visibilityByNodeId, {
        showGroupBadge: true,
        siblingIndex,
        siblingCount: renderableRootNodeIds.length
      });
      desiredElements.set(key, existing);
    } else {
      const el = createNodeElement(tree, nodeKey, query, visibilityByNodeId, {
        showGroupBadge: true,
        siblingIndex,
        siblingCount: renderableRootNodeIds.length
      });
      if (el) {
        desiredElements.set(key, el);
      }
    }
  }

  const desiredKeySet = new Set(desiredKeys);
  for (const [key, el] of existingByKey) {
    if (!desiredKeySet.has(key)) {
      el.remove();
    }
  }

  // Also remove non-keyed children like .empty placeholders
  for (const child of Array.from(dom.treeRoot.children)) {
    if (!child.dataset?.treeKey && child.classList.contains("empty")) {
      child.remove();
    }
  }

  const orderedElements = desiredKeys
    .map((key) => desiredElements.get(key))
    .filter(Boolean);

  if (!orderedElements.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = query
      ? t("noTabsMatchSearch", [], "No tabs match your search.")
      : t("noTabsInWindow", [], "No tabs in this window.");
    dom.treeRoot.appendChild(empty);
  } else {
    for (let i = 0; i < orderedElements.length; i++) {
      const el = orderedElements[i];
      if (dom.treeRoot.children[i] !== el) {
        dom.treeRoot.insertBefore(el, dom.treeRoot.children[i] || null);
      }
    }
    // Remove trailing orphans
    while (dom.treeRoot.children.length > orderedElements.length) {
      dom.treeRoot.lastChild.remove();
    }
  }

  updateLastRenderedState(tree);
  refreshVisibleTabIds();
  setTreeRowTabStop();
}

function renderTree() {
  if (shouldFullRebuild(currentWindowTree())) {
    fullRebuildTree();
  } else {
    patchTree();
  }
}

function render() {
  const tree = currentWindowTree();
  if (tree) {
    pruneSelection(tree);
  }

  applyThemeFromSettings();
  hydrateSettingsForm();
  updateShortcutHint();
  renderTree();
  renderContextMenu();
}

function scheduleRender() {
  if (state.renderRafId) {
    return;
  }
  state.renderRafId = requestAnimationFrame(() => {
    state.renderRafId = null;
    render();
  });
}

async function bootstrap() {
  state.panelWindowId = await resolvePanelWindowId();
  const response = await send(MESSAGE_TYPES.GET_STATE, {
    windowId: state.panelWindowId
  });
  if (response?.ok) {
    state.settings = response.payload.settings;
    state.windows = response.payload.windows || {};
    state.focusedWindowId = response.payload.focusedWindowId;
    if (!Number.isInteger(state.panelWindowId) && Number.isInteger(response.payload.focusedWindowId)) {
      state.panelWindowId = response.payload.focusedWindowId;
    }
    const activeTabId = currentActiveTabId();
    if (activeTabId) {
      replaceSelection([activeTabId], activeTabId);
    }
    render();
  }
}

function bindEvents() {
  dom.contextMenu.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  dom.search.addEventListener("input", () => {
    state.search = dom.search.value;
    if (state.searchRenderTimer) {
      clearTimeout(state.searchRenderTimer);
    }
    state.searchRenderTimer = setTimeout(() => {
      state.searchRenderTimer = null;
      renderTree();
      renderContextMenu();
    }, 90);
  });

  dom.searchWrap.addEventListener("dragover", (event) => {
    if (!state.draggingTabIds.length || Number.isInteger(state.draggingGroupId)) {
      return;
    }
    event.preventDefault();
    setDragTarget({
      kind: "root",
      position: "inside",
      valid: true
    }, dom.searchWrap);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  });

  dom.searchWrap.addEventListener("dragleave", (event) => {
    if (!dom.searchWrap.contains(event.relatedTarget) && state.dragTarget.kind === "root") {
      setDragTarget(null, null);
    }
  });

  dom.searchWrap.addEventListener("drop", async (event) => {
    if (!state.draggingTabIds.length || Number.isInteger(state.draggingGroupId)) {
      return;
    }
    event.preventDefault();
    stopAutoScroll();
    const tree = currentWindowTree();
    if (!tree) {
      return;
    }
    await dropToRoot(tree);
    clearDropClasses();
  });

  dom.treeRoot.addEventListener("dragleave", (event) => {
    if (dom.treeRoot.contains(event.relatedTarget)) {
      return;
    }
    if (state.dragTarget.kind !== "root") {
      setDragTarget(null, null);
    }
    stopAutoScroll();
  });

  // --- Delegated tree-root event handlers ---

  dom.treeRoot.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (actionEl) {
      event.stopPropagation();
      const row = actionEl.closest(".tree-row[data-tab-id]");
      const tabId = row ? Number(row.dataset.tabId) : null;
      if (!Number.isFinite(tabId)) {
        return;
      }
      const action = actionEl.dataset.action;
      if (action === "toggle-collapse") {
        await send(MESSAGE_TYPES.TREE_ACTION, {
          type: TREE_ACTIONS.TOGGLE_COLLAPSE,
          tabId
        });
        return;
      }
      if (action === "add-child") {
        await send(MESSAGE_TYPES.TREE_ACTION, {
          type: TREE_ACTIONS.ADD_CHILD_TAB,
          parentTabId: tabId
        });
        return;
      }
      if (action === "close-tab") {
        const tree = currentWindowTree();
        if (!tree) {
          return;
        }
        const nId = nodeId(tabId);
        const node = tree.nodes[nId];
        if (!node) {
          return;
        }
        const closesSubtree = node.childNodeIds.length > 0 && !!node.collapsed;
        if (!closesSubtree) {
          await requestClose({
            kind: "single",
            tabId,
            includeDescendants: false
          }, 1, false);
          return;
        }
        const plan = buildClosePlan(tree, [tabId]);
        if (!plan.rootTabIds.length) {
          return;
        }
        await requestClose({
          kind: "single",
          tabId: plan.rootTabIds[0],
          includeDescendants: true
        }, plan.totalTabs, false);
        return;
      }
      return;
    }

    const header = event.target.closest(".group-header[data-group-id]");
    if (header) {
      const groupId = Number(header.dataset.groupId);
      const windowId = Number(header.dataset.windowId);
      if (Number.isInteger(groupId)) {
        await send(MESSAGE_TYPES.TREE_ACTION, {
          type: TREE_ACTIONS.TOGGLE_GROUP_COLLAPSE,
          groupId,
          windowId: Number.isInteger(windowId) ? windowId : currentWindowTree()?.windowId
        });
      }
      return;
    }

    const row = event.target.closest(".tree-row[data-tab-id]");
    if (row) {
      const tabId = Number(row.dataset.tabId);
      if (Number.isFinite(tabId)) {
        await onRowClicked(event, tabId);
      }
    }
  });

  dom.treeRoot.addEventListener("contextmenu", (event) => {
    const header = event.target.closest(".group-header[data-group-id]");
    if (header) {
      const groupId = Number(header.dataset.groupId);
      const windowId = Number(header.dataset.windowId);
      openGroupContextMenu(event, groupId, Number.isInteger(windowId) ? windowId : currentWindowTree()?.windowId);
      return;
    }
    const row = event.target.closest(".tree-row[data-tab-id]");
    if (row) {
      const tabId = Number(row.dataset.tabId);
      if (Number.isFinite(tabId)) {
        openTabContextMenu(event, tabId);
      }
    }
  });

  dom.treeRoot.addEventListener("focusin", (event) => {
    const row = event.target.closest(".tree-row[data-tab-id]");
    if (row) {
      const tabId = Number(row.dataset.tabId);
      if (Number.isFinite(tabId)) {
        state.focusedTabId = tabId;
        setTreeRowTabStop(tabId);
      }
    }
  });

  dom.treeRoot.addEventListener("keydown", async (event) => {
    const header = event.target.closest(".group-header[data-group-id]");
    if (header) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      const groupId = Number(header.dataset.groupId);
      const windowId = Number(header.dataset.windowId);
      if (Number.isInteger(groupId)) {
        await send(MESSAGE_TYPES.TREE_ACTION, {
          type: TREE_ACTIONS.TOGGLE_GROUP_COLLAPSE,
          groupId,
          windowId: Number.isInteger(windowId) ? windowId : currentWindowTree()?.windowId
        });
      }
      return;
    }

    const row = event.target.closest(".tree-row[data-tab-id]");
    if (!row) {
      return;
    }
    const tabId = Number(row.dataset.tabId);
    if (!Number.isFinite(tabId)) {
      return;
    }

    const ordered = visibleTabIdsInOrder();
    const currentIndex = ordered.indexOf(tabId);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (currentIndex >= 0 && currentIndex < ordered.length - 1) {
        focusTreeRow(ordered[currentIndex + 1]);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentIndex > 0) {
        focusTreeRow(ordered[currentIndex - 1]);
      }
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      const liveTree = currentWindowTree();
      const liveNode = liveTree?.nodes[nodeId(tabId)];
      if (!liveNode) {
        return;
      }
      if (liveNode.childNodeIds.length && liveNode.collapsed) {
        await send(MESSAGE_TYPES.TREE_ACTION, {
          type: TREE_ACTIONS.TOGGLE_COLLAPSE,
          tabId
        });
        return;
      }
      const firstChildNodeId = liveNode.childNodeIds[0];
      const firstChildTabId = liveTree?.nodes[firstChildNodeId]?.tabId;
      if (Number.isFinite(firstChildTabId)) {
        focusTreeRow(firstChildTabId);
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const liveTree = currentWindowTree();
      const liveNode = liveTree?.nodes[nodeId(tabId)];
      if (!liveNode) {
        return;
      }
      if (liveNode.childNodeIds.length && !liveNode.collapsed) {
        await send(MESSAGE_TYPES.TREE_ACTION, {
          type: TREE_ACTIONS.TOGGLE_COLLAPSE,
          tabId
        });
        return;
      }
      const parentTabId = liveTree?.nodes[liveNode.parentNodeId]?.tabId;
      if (Number.isFinite(parentTabId)) {
        focusTreeRow(parentTabId);
      }
      return;
    }

    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      await onRowClicked({ metaKey: false, ctrlKey: false, shiftKey: false }, tabId);
      return;
    }

    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      openTabContextMenu({
        preventDefault() {},
        stopPropagation() {},
        clientX: Math.round(rect.left + Math.min(24, rect.width / 2)),
        clientY: Math.round(rect.top + rect.height / 2)
      }, tabId);
    }
  });

  dom.treeRoot.addEventListener("dragstart", (event) => {
    const header = event.target.closest(".group-header[data-group-id]");
    if (header) {
      const groupId = Number(header.dataset.groupId);
      state.draggingGroupId = groupId;
      state.draggingTabIds = [];
      resetInsideDropHover();
      stopAutoScroll();
      setDragTarget(null, null);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.dropEffect = "move";
        event.dataTransfer.setData("text/plain", `group:${groupId}`);
      }
      header.classList.add("dragging");
      updateSearchDropAffordance();
      return;
    }

    const row = event.target.closest(".tree-row[data-tab-id]");
    if (!row) {
      return;
    }
    const tabId = Number(row.dataset.tabId);
    if (!Number.isFinite(tabId)) {
      return;
    }
    if (state.draggingGroupId) {
      event.preventDefault();
      return;
    }

    const selection = state.selectedTabIds.has(tabId) && state.selectedTabIds.size > 1
      ? selectedTabIdsArray()
      : [tabId];

    state.draggingTabIds = selection;
    resetInsideDropHover();
    stopAutoScroll();
    setDragTarget(null, null);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.dropEffect = "move";
      event.dataTransfer.setData("text/plain", selection.join(","));
    }
    row.classList.add("dragging");
    updateSearchDropAffordance();
  });

  dom.treeRoot.addEventListener("dragend", (event) => {
    const header = event.target.closest(".group-header[data-group-id]");
    if (header) {
      state.draggingGroupId = null;
      resetInsideDropHover();
      stopAutoScroll();
      header.classList.remove("dragging");
      clearDropClasses();
      return;
    }

    const row = event.target.closest(".tree-row[data-tab-id]");
    if (row) {
      state.draggingTabIds = [];
      resetInsideDropHover();
      stopAutoScroll();
      row.classList.remove("dragging");
      clearDropClasses();
    }
  });

  dom.treeRoot.addEventListener("dragover", (event) => {
    const tree = currentWindowTree();
    if (!tree) {
      return;
    }

    const header = event.target.closest(".group-header[data-group-id]");
    if (header) {
      if (!Number.isInteger(state.draggingGroupId)) {
        return;
      }
      event.preventDefault();
      maybeAutoScroll(event.clientY);
      const groupId = Number(header.dataset.groupId);
      const position = getDropPosition(event, header, { allowInside: false });
      const valid = canDropGroup(tree, state.draggingGroupId, { targetGroupId: groupId });
      setDragTarget({
        kind: "group",
        groupId,
        position,
        valid
      }, header);
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = valid ? "move" : "none";
      }
      return;
    }

    const row = event.target.closest(".tree-row[data-tab-id]");
    if (!row) {
      return;
    }

    if (!state.draggingTabIds.length && !Number.isInteger(state.draggingGroupId)) {
      return;
    }
    event.preventDefault();
    maybeAutoScroll(event.clientY);

    const tabId = Number(row.dataset.tabId);
    if (!Number.isFinite(tabId)) {
      return;
    }
    const node = tree.nodes[nodeId(tabId)];
    if (!node) {
      return;
    }

    if (Number.isInteger(state.draggingGroupId)) {
      resetInsideDropHover();
      const position = getDropPosition(event, row, { allowInside: false });
      const valid = canDropGroup(tree, state.draggingGroupId, { targetGroupId: node.groupId, targetTabId: tabId });
      setDragTarget({
        kind: "tab",
        tabId,
        position,
        valid
      }, row);
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = valid ? "move" : "none";
      }
      return;
    }

    if (!state.draggingTabIds.length) {
      return;
    }

    if (state.draggingTabIds.includes(tabId)) {
      resetInsideDropHover();
      const position = getDropPosition(event, row, { allowInside: true });
      setDragTarget({
        kind: "tab",
        tabId,
        position,
        valid: false
      }, row);
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "none";
      }
      return;
    }

    const intent = resolveTabDropIntent(tree, row, tabId, event);
    setDragTarget({
      kind: "tab",
      tabId,
      position: intent.position,
      valid: intent.valid
    }, row);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = intent.valid ? "move" : "none";
    }
  });

  dom.treeRoot.addEventListener("drop", async (event) => {
    const tree = currentWindowTree();
    if (!tree) {
      return;
    }

    const header = event.target.closest(".group-header[data-group-id]");
    if (header) {
      if (!Number.isInteger(state.draggingGroupId)) {
        return;
      }
      event.preventDefault();
      stopAutoScroll();
      const groupId = Number(header.dataset.groupId);
      const position = getDropPosition(event, header, { allowInside: false });
      const valid = canDropGroup(tree, state.draggingGroupId, { targetGroupId: groupId });
      setDragTarget({
        kind: "group",
        groupId,
        position,
        valid
      }, header);
      if (!valid) {
        return;
      }
      await moveGroupBlockToTarget(tree, { kind: "group", groupId }, position);
      state.draggingGroupId = null;
      clearDropClasses();
      return;
    }

    const row = event.target.closest(".tree-row[data-tab-id]");
    if (!row) {
      return;
    }

    if (!state.draggingTabIds.length && !Number.isInteger(state.draggingGroupId)) {
      return;
    }
    event.preventDefault();
    stopAutoScroll();

    const tabId = Number(row.dataset.tabId);
    if (!Number.isFinite(tabId)) {
      return;
    }
    const node = tree.nodes[nodeId(tabId)];
    if (!node) {
      return;
    }

    if (Number.isInteger(state.draggingGroupId)) {
      resetInsideDropHover();
      const position = getDropPosition(event, row, { allowInside: false });
      const valid = canDropGroup(tree, state.draggingGroupId, { targetGroupId: node.groupId, targetTabId: tabId });
      setDragTarget({
        kind: "tab",
        tabId,
        position,
        valid
      }, row);
      if (!valid) {
        return;
      }
      await moveGroupBlockToTarget(tree, { kind: "tab", tabId }, position);
      state.draggingGroupId = null;
      clearDropClasses();
      return;
    }

    if (!state.draggingTabIds.length || state.draggingTabIds.includes(tabId)) {
      return;
    }

    const intent = resolveTabDropIntent(tree, row, tabId, event);
    setDragTarget({
      kind: "tab",
      tabId,
      position: intent.position,
      valid: intent.valid
    }, row);
    if (!intent.valid) {
      return;
    }

    const payload = buildDropPayload(tree, state.draggingTabIds, tabId, intent.position);
    if (!payload) {
      return;
    }

    await send(MESSAGE_TYPES.TREE_ACTION, payload);
    state.draggingTabIds = [];
    resetInsideDropHover();
    clearDropClasses();
  });

  // --- End delegated tree-root event handlers ---

  dom.addChildGlobal.addEventListener("click", async () => {
    const activeTabId = currentActiveTabId();
    if (!activeTabId) {
      return;
    }
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.ADD_CHILD_TAB,
      parentTabId: activeTabId
    });
  });

  dom.openSettings.addEventListener("click", () => {
    state.settingsReturnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dom.settingsPanel.hidden = false;
    queueMicrotask(() => {
      const first = dom.settingsPanel.querySelector("button, input, select");
      if (first) {
        first.focus();
      }
    });
    closeContextMenu();
  });

  dom.closeSettings.addEventListener("click", () => {
    closeSettingsPanel();
  });

  dom.resetAppearanceSettings?.addEventListener("click", async () => {
    await resetSettingsSection("appearance");
  });

  dom.resetBehaviorSettings?.addEventListener("click", async () => {
    await resetSettingsSection("behavior");
  });

  dom.resetSafetySettings?.addEventListener("click", async () => {
    await resetSettingsSection("safety");
  });

  dom.confirmCancel.addEventListener("click", () => {
    closeConfirmDialog();
  });

  dom.confirmOk.addEventListener("click", async () => {
    const pending = state.pendingCloseAction;
    if (!pending) {
      closeConfirmDialog();
      return;
    }

    if (dom.confirmSkip.checked) {
      const patch = pending.isBatch
        ? { confirmCloseBatch: false }
        : { confirmCloseSubtree: false };
      state.settings = { ...state.settings, ...patch };
      await send(MESSAGE_TYPES.PATCH_SETTINGS, { settingsPatch: patch });
    }

    closeConfirmDialog();
    await executeCloseAction(pending.action);
  });

  dom.treeRoot.addEventListener("scroll", () => {
    closeContextMenu();
  }, { passive: true });

  document.addEventListener("pointerdown", (event) => {
    if (!state.contextMenu.open) {
      return;
    }
    if (dom.contextMenu.contains(event.target)) {
      return;
    }
    closeContextMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (!dom.settingsPanel.hidden && event.key === "Escape") {
      event.preventDefault();
      closeSettingsPanel();
      return;
    }

    if (!dom.confirmOverlay.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeConfirmDialog();
        return;
      }

      if (event.key === "Tab") {
        const focusables = Array.from(dom.confirmOverlay.querySelectorAll("button, input"))
          .filter((el) => !el.disabled && el.getClientRects().length > 0);
        if (!focusables.length) {
          return;
        }
        const currentIndex = focusables.indexOf(document.activeElement);
        const delta = event.shiftKey ? -1 : 1;
        const nextIndex = currentIndex >= 0
          ? (currentIndex + delta + focusables.length) % focusables.length
          : 0;
        event.preventDefault();
        focusables[nextIndex].focus();
      }
      return;
    }

    if (!state.contextMenu.open) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeContextMenu();
      return;
    }

    if (event.target instanceof HTMLInputElement) {
      return;
    }

    const items = contextMenuFocusables();
    if (!items.length) {
      return;
    }

    const currentIndex = items.indexOf(document.activeElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % items.length : 0;
      items[nextIndex].focus();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = currentIndex >= 0 ? (currentIndex - 1 + items.length) % items.length : items.length - 1;
      items[nextIndex].focus();
      return;
    }

    if (event.key === "ArrowLeft") {
      const activeInSubmenu = document.activeElement?.closest?.(".context-submenu-panel");
      if (!activeInSubmenu) {
        return;
      }
      event.preventDefault();
      const submenu = activeInSubmenu.closest(".context-submenu");
      const trigger = submenu?.querySelector(".context-submenu-trigger");
      if (trigger) {
        trigger.focus();
      }
      return;
    }

    if (event.key === "Enter" && document.activeElement?.classList?.contains("context-menu-item")) {
      event.preventDefault();
      document.activeElement.click();
    }
  });

  window.addEventListener("blur", () => {
    closeContextMenu();
  });
  window.addEventListener("resize", () => {
    if (!state.contextMenu.open) {
      return;
    }
    positionContextMenu();
    updateContextSubmenuDirection();
  });

  dom.settingsForm.addEventListener("input", async (event) => {
    const target = event.target;
    if (!target?.name || !state.settings) {
      return;
    }

    let value;
    if (target.type === "checkbox") {
      value = !!target.checked;
    } else if (target.type === "range") {
      value = Number(target.value);
    } else {
      value = target.value;
    }

    const patch = { [target.name]: value };

    if (target.name === "themePresetLight" || target.name === "themePresetDark") {
      const fallbackMode = target.name === "themePresetDark" ? "dark" : "light";
      const themeTokens = resolvePresetTokens(value, fallbackMode);
      if (themeTokens?.accent) {
        patch.accentColor = themeTokens.accent;
      }
    }

    await applySettingsPatch(patch);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== MESSAGE_TYPES.STATE_UPDATED) {
      return;
    }
    const payload = message.payload;
    const next = applyRuntimeStateUpdate({
      settings: state.settings,
      windows: state.windows,
      panelWindowId: state.panelWindowId,
      focusedWindowId: state.focusedWindowId
    }, payload);
    state.settings = next.settings;
    state.windows = next.windows;
    state.focusedWindowId = next.focusedWindowId;
    if (Number.isInteger(next.focusedWindowId) && !Number.isInteger(state.panelWindowId)) {
      state.panelWindowId = next.focusedWindowId;
    }

    if (!next.shouldRender) {
      return;
    }

    const activeTabId = currentActiveTabId();
    if (state.selectedTabIds.size === 0 && activeTabId) {
      replaceSelection([activeTabId], activeTabId);
    }

    scheduleRender();
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.settings) {
      applyThemeFromSettings();
    }
  });
}

bindEvents();
void bootstrap();
