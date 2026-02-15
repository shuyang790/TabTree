export const SETTINGS_KEY = "settings.v1";
export const SYNC_SNAPSHOT_KEY = "tree.sync.snapshot.v1";
export const LOCAL_WINDOW_PREFIX = "tree.local.v1.";
export const STORAGE_WRITE_DEBOUNCE_MS = 400;
export const SYNC_MAX_WINDOWS = 3;
export const SYNC_MAX_NODES_PER_WINDOW = 80;
export const SYNC_MAX_URL_LENGTH = 220;

export const DEFAULT_SETTINGS = {
  themePresetLight: "base-light",
  themePresetDark: "base-dark",
  accentColor: "#0b57d0",
  density: "comfortable",
  fontScale: 1,
  indentPx: 16,
  radiusPx: 8,
  dragExpandOnHover: true,
  dragExpandDelayMs: 450,
  showBottomRootDropZone: true,
  dragInsideDwellMs: 220,
  dragEdgeRatio: 0.24,
  showFavicons: true,
  showCloseButton: true,
  showGroupHeaders: true,
  showDragStatusChip: false,
  shortcutHintsEnabled: true,
  confirmCloseSubtree: true,
  confirmCloseBatch: true
};

export const DENSITY_OPTIONS = ["compact", "comfortable", "cozy", "spacious"];

export const THEME_PRESET_LIGHT_KEYS = [
  "base-light",
  "catppuccin-latte",
  "catppuccin-frappe",
  "catppuccin-macchiato",
  "catppuccin-mocha",
  "everforest-light",
  "everforest-dark",
  "gruvbox-light",
  "gruvbox-dark",
  "tokyonight-day",
  "tokyonight-night",
  "kanagawa-lotus",
  "kanagawa-wave",
  "one-light",
  "one-dark"
];

export const THEME_PRESET_DARK_KEYS = [
  "base-dark",
  "catppuccin-latte",
  "catppuccin-frappe",
  "catppuccin-macchiato",
  "catppuccin-mocha",
  "everforest-light",
  "everforest-dark",
  "gruvbox-light",
  "gruvbox-dark",
  "tokyonight-day",
  "tokyonight-night",
  "kanagawa-lotus",
  "kanagawa-wave",
  "one-light",
  "one-dark"
];

export const SETTINGS_NUMERIC_RANGES = {
  fontScale: { min: 0.9, max: 1.2 },
  indentPx: { min: 10, max: 28 },
  radiusPx: { min: 2, max: 16 },
  dragExpandDelayMs: { min: 200, max: 1200 },
  dragInsideDwellMs: { min: 120, max: 800 },
  dragEdgeRatio: { min: 0.1, max: 0.4 }
};

export const MESSAGE_TYPES = {
  GET_STATE: "GET_STATE",
  PATCH_SETTINGS: "PATCH_SETTINGS",
  TREE_ACTION: "TREE_ACTION",
  STATE_UPDATED: "STATE_UPDATED",
  FOCUS_SEARCH: "FOCUS_SEARCH"
};

export const TREE_ACTIONS = {
  ADD_CHILD_TAB: "ADD_CHILD_TAB",
  REPARENT_TAB: "REPARENT_TAB",
  MOVE_TO_ROOT: "MOVE_TO_ROOT",
  TOGGLE_COLLAPSE: "TOGGLE_COLLAPSE",
  TOGGLE_GROUP_COLLAPSE: "TOGGLE_GROUP_COLLAPSE",
  CLOSE_SUBTREE: "CLOSE_SUBTREE",
  ACTIVATE_TAB: "ACTIVATE_TAB",
  BATCH_CLOSE_TABS: "BATCH_CLOSE_TABS",
  BATCH_GROUP_NEW: "BATCH_GROUP_NEW",
  BATCH_GROUP_EXISTING: "BATCH_GROUP_EXISTING",
  BATCH_CLOSE_SUBTREES: "BATCH_CLOSE_SUBTREES",
  BATCH_MOVE_TO_ROOT: "BATCH_MOVE_TO_ROOT",
  BATCH_REPARENT: "BATCH_REPARENT",
  UNDO_LAST_TREE_MOVE: "UNDO_LAST_TREE_MOVE",
  MOVE_GROUP_BLOCK: "MOVE_GROUP_BLOCK",
  RENAME_GROUP: "RENAME_GROUP",
  SET_GROUP_COLOR: "SET_GROUP_COLOR"
};
