import { MESSAGE_TYPES, TREE_ACTIONS } from "../shared/constants.js";

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
  { value: "grey", label: "Grey" },
  { value: "blue", label: "Blue" },
  { value: "red", label: "Red" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "pink", label: "Pink" },
  { value: "purple", label: "Purple" },
  { value: "cyan", label: "Cyan" },
  { value: "orange", label: "Orange" }
];

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
  focusedWindowId: null,
  search: "",
  draggingTabIds: [],
  selectedTabIds: new Set(),
  selectionAnchorTabId: null,
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
    renameOpen: false
  }
};

const dom = {
  treeRoot: document.getElementById("tree-root"),
  search: document.getElementById("search"),
  searchWrap: document.getElementById("search-wrap"),
  searchDropHint: document.getElementById("search-drop-hint"),
  addChildGlobal: document.getElementById("add-child-global"),
  batchBar: document.getElementById("batch-bar"),
  batchCount: document.getElementById("batch-count"),
  settingsPanel: document.getElementById("settings-panel"),
  openSettings: document.getElementById("open-settings"),
  closeSettings: document.getElementById("close-settings"),
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

function nodeId(tabId) {
  return `tab:${tabId}`;
}

function currentWindowTree() {
  if (state.focusedWindowId && state.windows[state.focusedWindowId]) {
    return state.windows[state.focusedWindowId];
  }
  const firstWindowId = Object.keys(state.windows)[0];
  return firstWindowId ? state.windows[firstWindowId] : null;
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
    renameOpen: false
  };
}

function visibleTabIdsInOrder() {
  return Array.from(dom.treeRoot.querySelectorAll(".tree-row[data-tab-id]"))
    .map((row) => Number(row.dataset.tabId))
    .filter((id) => Number.isFinite(id));
}

function replaceSelection(tabIds, anchorTabId = null) {
  state.selectedTabIds = new Set(tabIds.filter((id) => Number.isFinite(id)));
  state.selectionAnchorTabId = anchorTabId;
  updateBatchBar();
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
  updateBatchBar();
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

function updateShortcutHint() {
  if (!state.settings?.shortcutHintsEnabled) {
    dom.hintBar.textContent = "";
    return;
  }
  dom.hintBar.textContent = "Shift+Click selects range. Right-click for actions. Drag search bar to move to top-level.";
}

function updateBatchBar() {
  const count = state.selectedTabIds.size;
  if (count <= 1) {
    dom.batchBar.hidden = true;
    dom.batchCount.textContent = "";
    return;
  }
  dom.batchBar.hidden = false;
  dom.batchCount.textContent = `${count} selected`;
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
  dom.contextMenu.hidden = true;
  dom.contextMenu.innerHTML = "";
  resetContextMenuState();
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
    renameOpen: false
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
    renameOpen: false
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
  closeContextMenu();
  await send(MESSAGE_TYPES.TREE_ACTION, {
    type: TREE_ACTIONS.SET_GROUP_COLOR,
    groupId,
    windowId,
    color
  });
}

function createContextMenuButton(label, action, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "context-menu-item";
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

function buildTabContextMenu(tree) {
  const fragment = document.createDocumentFragment();
  const primaryNode = tree.nodes[nodeId(state.contextMenu.primaryTabId)];
  const scopeTabIds = state.contextMenu.scopeTabIds;
  const closeCount = scopeTabIds.length;
  const hasGroupedTabs = scopeTabIds.some((tabId) => tree.nodes[nodeId(tabId)]?.groupId !== null);
  const closeLabel = closeCount === 0
    ? "Close selected tab(s)"
    : closeCount === 1
      ? "Close selected tab"
      : `Close ${closeCount} selected tabs`;
  const copyUrls = scopedUrls(tree, scopeTabIds);

  fragment.appendChild(
    createContextMenuButton(closeLabel, "close-selected-tabs", closeCount === 0)
  );
  fragment.appendChild(
    createContextMenuButton("Add selected to new tab group", "group-selected-new", closeCount === 0 || hasGroupedTabs)
  );
  fragment.appendChild(createContextMenuSeparator());
  fragment.appendChild(
    createContextMenuButton("Add child tab", "add-child", !primaryNode)
  );
  fragment.appendChild(
    createContextMenuButton("Move selected to top-level", "move-selected-root", closeCount === 0)
  );
  fragment.appendChild(
    createContextMenuButton("Toggle collapse", "toggle-collapse", !primaryNode?.childNodeIds?.length)
  );
  fragment.appendChild(
    createContextMenuButton("Copy URL(s)", "copy-urls", !copyUrls.length)
  );

  return fragment;
}

function buildGroupContextMenu(tree) {
  const fragment = document.createDocumentFragment();
  const groupId = state.contextMenu.groupId;
  const group = tree.groups?.[groupId];
  const groupExists = !!group;

  if (!state.contextMenu.renameOpen) {
    fragment.appendChild(createContextMenuButton("Rename group...", "rename-group", !groupExists));
  } else {
    const form = document.createElement("form");
    form.className = "context-rename-form";
    form.addEventListener("submit", submitGroupRename);

    const input = document.createElement("input");
    input.className = "context-rename-input";
    input.name = "group-title";
    input.value = group?.title || "";
    input.placeholder = "Group name";
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
    apply.textContent = "Save";

    form.append(input, apply);
    fragment.appendChild(form);
  }

  const submenu = document.createElement("div");
  submenu.className = "context-submenu";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "context-menu-item context-submenu-trigger";
  trigger.textContent = "Color";
  trigger.disabled = !groupExists;
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");

  const panel = document.createElement("div");
  panel.className = "context-submenu-panel";
  panel.setAttribute("role", "menu");

  for (const option of GROUP_COLOR_OPTIONS) {
    const colorBtn = document.createElement("button");
    colorBtn.type = "button";
    colorBtn.className = "context-menu-item context-color-item";
    colorBtn.dataset.color = option.value;
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

    const label = document.createElement("span");
    label.textContent = option.label;

    colorBtn.append(dot, label);
    panel.appendChild(colorBtn);
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const willOpen = !submenu.classList.contains("open");
    submenu.classList.toggle("open", willOpen);
    trigger.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) {
      const first = panel.querySelector(".context-menu-item:not([disabled])");
      if (first) {
        first.focus();
      }
    }
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    submenu.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    const first = panel.querySelector(".context-menu-item:not([disabled])");
    if (first) {
      first.focus();
    }
  });

  submenu.append(trigger, panel);
  fragment.appendChild(submenu);

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
    name: group?.title?.trim() || `Group ${groupId}`,
    color: GROUP_COLOR_MAP[group?.color] || GROUP_COLOR_MAP.grey,
    collapsed: !!group?.collapsed
  };
}

function shouldRenderNode(tree, nodeKey, query) {
  const node = tree.nodes[nodeKey];
  if (!node) {
    return false;
  }
  if (matchesSearch(node, query)) {
    return true;
  }
  return node.childNodeIds.some((child) => shouldRenderNode(tree, child, query));
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

function getDropPosition(event, row) {
  const rect = row.getBoundingClientRect();
  const y = event.clientY - rect.top;
  if (y < rect.height * 0.25) {
    return "before";
  }
  if (y > rect.height * 0.75) {
    return "after";
  }
  return "inside";
}

function clearDropClasses() {
  dom.treeRoot.querySelectorAll(".drop-before, .drop-after, .drop-inside").forEach((el) => {
    el.classList.remove("drop-before", "drop-after", "drop-inside");
  });
}

function setSearchDropActive(active) {
  dom.searchWrap.dataset.dropActive = active ? "true" : "false";
  dom.searchDropHint.hidden = !active;
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
  dom.confirmMessage.textContent = `This will close ${totalTabs} tabs. Continue?`;
  dom.confirmSkip.checked = false;
  dom.confirmOverlay.hidden = false;
}

function closeConfirmDialog() {
  state.pendingCloseAction = null;
  dom.confirmOverlay.hidden = true;
  dom.confirmSkip.checked = false;
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
  clearDropClasses();
  setSearchDropActive(false);
}

async function onRowClicked(event, tabId) {
  const isToggle = event.metaKey || event.ctrlKey;

  if (event.shiftKey) {
    selectRangeTo(tabId);
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.ACTIVATE_TAB,
      tabId
    });
    render();
    return;
  }

  if (isToggle) {
    toggleSelection(tabId);
    render();
    return;
  }

  replaceSelection([tabId], tabId);
  await send(MESSAGE_TYPES.TREE_ACTION, {
    type: TREE_ACTIONS.ACTIVATE_TAB,
    tabId
  });
  render();
}

function createNodeRow(tree, node, options = {}) {
  const { showGroupBadge = true } = options;
  const row = document.createElement("div");
  row.className = "tree-row";
  row.dataset.tabId = String(node.tabId);
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-expanded", node.childNodeIds.length ? String(!node.collapsed) : "false");
  row.draggable = true;

  if (tree.selectedTabId === node.tabId) {
    row.classList.add("active");
  }
  if (state.selectedTabIds.has(node.tabId)) {
    row.classList.add("selected");
  }
  if (node.pinned) {
    row.classList.add("pinned-row");
    row.title = node.lastKnownTitle || "Pinned tab";
  }

  const twisty = document.createElement("button");
  twisty.className = "twisty";
  twisty.textContent = node.childNodeIds.length ? (node.collapsed ? "▸" : "▾") : "";
  twisty.title = node.childNodeIds.length ? "Toggle children" : "";
  twisty.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!node.childNodeIds.length) {
      return;
    }
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.TOGGLE_COLLAPSE,
      tabId: node.tabId
    });
  });

  const favicon = document.createElement("img");
  favicon.className = "favicon";
  favicon.alt = "";
  favicon.src = state.settings?.showFavicons ? node.favIconUrl || "" : "";
  favicon.style.visibility = favicon.src ? "visible" : "hidden";

  const titleWrap = document.createElement("div");
  titleWrap.className = "title-wrap";
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = node.lastKnownTitle || "Untitled tab";
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
  addChild.title = "Add child tab";
  addChild.addEventListener("click", async (event) => {
    event.stopPropagation();
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.ADD_CHILD_TAB,
      parentTabId: node.tabId
    });
  });
  actions.appendChild(addChild);

  if (state.settings?.showCloseButton) {
    const closesSubtree = node.childNodeIds.length > 0 && !!node.collapsed;
    const close = document.createElement("button");
    close.className = "icon-btn";
    close.textContent = "×";
    close.title = closesSubtree ? "Close subtree" : "Close tab";
    close.addEventListener("click", async (event) => {
      event.stopPropagation();

      if (!closesSubtree) {
        await requestClose({
          kind: "single",
          tabId: node.tabId,
          includeDescendants: false
        }, 1, false);
        return;
      }

      const plan = buildClosePlan(tree, [node.tabId]);
      if (!plan.rootTabIds.length) {
        return;
      }

      await requestClose({
        kind: "single",
        tabId: plan.rootTabIds[0],
        includeDescendants: true
      }, plan.totalTabs, false);
    });
    actions.appendChild(close);
  }

  row.addEventListener("click", async (event) => {
    await onRowClicked(event, node.tabId);
  });
  row.addEventListener("contextmenu", (event) => {
    openTabContextMenu(event, node.tabId);
  });

  row.addEventListener("dragstart", (event) => {
    const selection = state.selectedTabIds.has(node.tabId) && state.selectedTabIds.size > 1
      ? selectedTabIdsArray()
      : [node.tabId];

    state.draggingTabIds = selection;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.dropEffect = "move";
      event.dataTransfer.setData("text/plain", selection.join(","));
    }
    row.classList.add("dragging");
    setSearchDropActive(true);
  });

  row.addEventListener("dragend", () => {
    state.draggingTabIds = [];
    row.classList.remove("dragging");
    clearDropClasses();
    setSearchDropActive(false);
  });

  row.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!state.draggingTabIds.length || state.draggingTabIds.includes(node.tabId)) {
      return;
    }

    const position = getDropPosition(event, row);
    clearDropClasses();
    if (!canDrop(tree, state.draggingTabIds, node.tabId, position)) {
      return;
    }

    if (position === "before") {
      row.classList.add("drop-before");
    } else if (position === "after") {
      row.classList.add("drop-after");
    } else {
      row.classList.add("drop-inside");
    }
  });

  row.addEventListener("dragleave", () => {
    row.classList.remove("drop-before", "drop-after", "drop-inside");
  });

  row.addEventListener("drop", async (event) => {
    event.preventDefault();
    if (!state.draggingTabIds.length || state.draggingTabIds.includes(node.tabId)) {
      clearDropClasses();
      return;
    }

    const position = getDropPosition(event, row);
    if (!canDrop(tree, state.draggingTabIds, node.tabId, position)) {
      clearDropClasses();
      state.draggingTabIds = [];
      return;
    }

    const payload = buildDropPayload(tree, state.draggingTabIds, node.tabId, position);
    clearDropClasses();
    if (!payload) {
      state.draggingTabIds = [];
      return;
    }

    await send(MESSAGE_TYPES.TREE_ACTION, payload);
    state.draggingTabIds = [];
    setSearchDropActive(false);
  });

  row.append(twisty, favicon, titleWrap, actions);
  return row;
}

function createNodeElement(tree, nodeKey, query, rowOptions = {}) {
  if (!shouldRenderNode(tree, nodeKey, query)) {
    return null;
  }

  const node = tree.nodes[nodeKey];
  if (!node) {
    return null;
  }

  const holder = document.createElement("div");
  holder.className = "tree-node";
  holder.appendChild(createNodeRow(tree, node, rowOptions));

  if (node.childNodeIds.length && !node.collapsed) {
    const children = document.createElement("div");
    children.className = "children";
    children.setAttribute("role", "group");
    for (const childId of node.childNodeIds) {
      const childEl = createNodeElement(tree, childId, query, rowOptions);
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

function createPinnedStrip(tree, pinnedRootNodeIds, query) {
  const section = document.createElement("section");
  section.className = "pinned-strip";

  const track = document.createElement("div");
  track.className = "pinned-track";

  let renderedCount = 0;
  for (const nodeKey of pinnedRootNodeIds) {
    if (!shouldRenderNode(tree, nodeKey, query)) {
      continue;
    }
    const node = tree.nodes[nodeKey];
    if (!node) {
      continue;
    }
    const row = createNodeRow(tree, node, { showGroupBadge: true });
    track.appendChild(row);
    renderedCount += 1;
  }

  if (!renderedCount) {
    return { element: null, renderedCount: 0 };
  }

  section.appendChild(track);
  return { element: section, renderedCount };
}

function createGroupSection(tree, groupId, rootNodeIds, query) {
  const group = groupDisplay(tree, groupId);
  const queryMatch = query && group.name.toLowerCase().includes(query);

  const renderedChildren = [];
  for (const nodeKey of rootNodeIds) {
    const child = createNodeElement(tree, nodeKey, query, { showGroupBadge: false });
    if (child) {
      renderedChildren.push(child);
    }
  }

  if (!renderedChildren.length && !queryMatch) {
    return null;
  }

  const section = document.createElement("section");
  section.className = "group-section";
  section.style.setProperty("--group-color", group.color);

  const header = document.createElement("div");
  header.className = "group-header";
  header.dataset.groupId = String(groupId);
  header.setAttribute("role", "button");
  header.setAttribute("tabindex", "0");
  header.setAttribute("aria-expanded", String(!group.collapsed));
  header.title = group.collapsed ? "Expand group" : "Collapse group";

  const colorDot = document.createElement("span");
  colorDot.className = "group-color-dot";

  const name = document.createElement("span");
  name.className = "group-name";
  name.textContent = group.name;

  const count = document.createElement("span");
  count.className = "group-count";
  count.textContent = String(rootNodeIds.length);

  const toggleGroupCollapsed = async () => {
    await send(MESSAGE_TYPES.TREE_ACTION, {
      type: TREE_ACTIONS.TOGGLE_GROUP_COLLAPSE,
      groupId,
      windowId: tree.windowId
    });
  };

  header.addEventListener("click", async () => {
    await toggleGroupCollapsed();
  });

  header.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    await toggleGroupCollapsed();
  });
  header.addEventListener("contextmenu", (event) => {
    openGroupContextMenu(event, groupId, tree.windowId);
  });

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
  const grouped = new Map();
  const ungrouped = [];

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
      if (!grouped.has(node.groupId)) {
        grouped.set(node.groupId, []);
      }
      grouped.get(node.groupId).push(rootNodeId);
      continue;
    }
    ungrouped.push(rootNodeId);
  }

  const groupedList = [...grouped.entries()].sort(([, a], [, b]) => {
    const ai = tree.nodes[a[0]]?.index ?? 0;
    const bi = tree.nodes[b[0]]?.index ?? 0;
    return ai - bi;
  });

  return { pinned, groupedList, ungrouped };
}

function renderTree() {
  dom.treeRoot.innerHTML = "";
  const tree = currentWindowTree();
  if (!tree) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No tabs available.";
    dom.treeRoot.appendChild(empty);
    return;
  }

  const query = state.search.trim().toLowerCase();
  const { pinned, groupedList, ungrouped } = rootBuckets(tree);

  let renderedCount = 0;

  if (pinned.length) {
    const pinLabel = document.createElement("div");
    pinLabel.className = "section-title";
    pinLabel.textContent = "Pinned";
    dom.treeRoot.appendChild(pinLabel);
    const { element, renderedCount: pinnedCount } = createPinnedStrip(tree, pinned, query);
    if (element) {
      dom.treeRoot.appendChild(element);
      renderedCount += pinnedCount;
    }
  }

  for (const [groupId, roots] of groupedList) {
    const section = createGroupSection(tree, groupId, roots, query);
    if (section) {
      dom.treeRoot.appendChild(section);
      renderedCount += 1;
    }
  }

  for (const rootNodeId of ungrouped) {
    const el = createNodeElement(tree, rootNodeId, query, { showGroupBadge: true });
    if (el) {
      dom.treeRoot.appendChild(el);
      renderedCount += 1;
    }
  }

  if (!renderedCount) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = query ? "No tabs match your search." : "No tabs in this window.";
    dom.treeRoot.appendChild(empty);
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
  updateBatchBar();
  renderTree();
  renderContextMenu();
}

async function bootstrap() {
  const response = await send(MESSAGE_TYPES.GET_STATE);
  if (response?.ok) {
    state.settings = response.payload.settings;
    state.windows = response.payload.windows || {};
    state.focusedWindowId = response.payload.focusedWindowId;
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
    renderTree();
    renderContextMenu();
  });

  dom.searchWrap.addEventListener("dragover", (event) => {
    if (!state.draggingTabIds.length) {
      return;
    }
    event.preventDefault();
    setSearchDropActive(true);
  });

  dom.searchWrap.addEventListener("dragleave", (event) => {
    if (!dom.searchWrap.contains(event.relatedTarget)) {
      setSearchDropActive(false);
    }
  });

  dom.searchWrap.addEventListener("drop", async (event) => {
    event.preventDefault();
    const tree = currentWindowTree();
    if (!tree) {
      return;
    }
    await dropToRoot(tree);
  });

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
    dom.settingsPanel.hidden = false;
    closeContextMenu();
  });

  dom.closeSettings.addEventListener("click", () => {
    dom.settingsPanel.hidden = true;
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
        ? { confirmCloseBatch: false, confirmCloseSubtree: false }
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

    state.settings = {
      ...state.settings,
      ...patch
    };
    render();

    await send(MESSAGE_TYPES.PATCH_SETTINGS, {
      settingsPatch: patch
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== MESSAGE_TYPES.STATE_UPDATED) {
      return;
    }
    const payload = message.payload;
    state.settings = payload.settings || state.settings;
    state.windows = payload.windows || state.windows;
    if (payload.focusedWindowId) {
      state.focusedWindowId = payload.focusedWindowId;
    }

    const activeTabId = currentActiveTabId();
    if (state.selectedTabIds.size === 0 && activeTabId) {
      replaceSelection([activeTabId], activeTabId);
    }

    render();
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.settings) {
      applyThemeFromSettings();
    }
  });
}

bindEvents();
void bootstrap();
