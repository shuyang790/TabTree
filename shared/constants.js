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
  showFavicons: true,
  showCloseButton: true,
  showGroupHeaders: true,
  shortcutHintsEnabled: true,
  confirmCloseSubtree: true,
  confirmCloseBatch: true
};

export const MESSAGE_TYPES = {
  GET_STATE: "GET_STATE",
  PATCH_SETTINGS: "PATCH_SETTINGS",
  TREE_ACTION: "TREE_ACTION",
  STATE_UPDATED: "STATE_UPDATED"
};

export const TREE_ACTIONS = {
  ADD_CHILD_TAB: "ADD_CHILD_TAB",
  REPARENT_TAB: "REPARENT_TAB",
  MOVE_TO_ROOT: "MOVE_TO_ROOT",
  TOGGLE_COLLAPSE: "TOGGLE_COLLAPSE",
  TOGGLE_GROUP_COLLAPSE: "TOGGLE_GROUP_COLLAPSE",
  CLOSE_SUBTREE: "CLOSE_SUBTREE",
  ACTIVATE_TAB: "ACTIVATE_TAB",
  BATCH_CLOSE_SUBTREES: "BATCH_CLOSE_SUBTREES",
  BATCH_MOVE_TO_ROOT: "BATCH_MOVE_TO_ROOT",
  BATCH_REPARENT: "BATCH_REPARENT"
};
