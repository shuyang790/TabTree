import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_SETTINGS } from "../shared/constants.js";
import { normalizeSettings } from "../shared/treeStore.js";

test("normalizeSettings keeps explicit light/dark presets and strips legacy keys", () => {
  const normalized = normalizeSettings({
    themePresetLight: "gruvbox-light",
    themePresetDark: "gruvbox-dark",
    themePreset: "catppuccin-mocha",
    themeMode: "dark",
    accentColor: "#112233"
  });

  assert.equal(normalized.themePresetLight, "gruvbox-light");
  assert.equal(normalized.themePresetDark, "gruvbox-dark");
  assert.equal(normalized.themePreset, undefined);
  assert.equal(normalized.themeMode, undefined);
  assert.equal(normalized.accentColor, "#112233");
});

test("normalizeSettings migrates legacy dark preset to dark appearance", () => {
  const normalized = normalizeSettings({ themePreset: "catppuccin-mocha" });

  assert.equal(normalized.themePresetLight, DEFAULT_SETTINGS.themePresetLight);
  assert.equal(normalized.themePresetDark, "catppuccin-mocha");
});

test("normalizeSettings migrates legacy light preset to light appearance", () => {
  const normalized = normalizeSettings({ themePreset: "everforest-light" });

  assert.equal(normalized.themePresetLight, "everforest-light");
  assert.equal(normalized.themePresetDark, DEFAULT_SETTINGS.themePresetDark);
});

test("normalizeSettings falls back to base presets when legacy preset is auto/custom", () => {
  const autoNormalized = normalizeSettings({ themePreset: "auto" });
  const customNormalized = normalizeSettings({ themePreset: "custom" });

  assert.equal(autoNormalized.themePresetLight, DEFAULT_SETTINGS.themePresetLight);
  assert.equal(autoNormalized.themePresetDark, DEFAULT_SETTINGS.themePresetDark);
  assert.equal(customNormalized.themePresetLight, DEFAULT_SETTINGS.themePresetLight);
  assert.equal(customNormalized.themePresetDark, DEFAULT_SETTINGS.themePresetDark);
});

test("normalizeSettings clamps ranges and rejects invalid enum/color/boolean values", () => {
  const normalized = normalizeSettings({
    themePresetLight: "unknown-light",
    themePresetDark: "unknown-dark",
    accentColor: "not-a-color",
    density: "ultra",
    fontScale: 2,
    indentPx: -100,
    radiusPx: "999",
    showFavicons: "true",
    showCloseButton: 1,
    showGroupHeaders: null,
    shortcutHintsEnabled: "yes",
    confirmCloseSubtree: "no",
    confirmCloseBatch: 0
  });

  assert.equal(normalized.themePresetLight, DEFAULT_SETTINGS.themePresetLight);
  assert.equal(normalized.themePresetDark, DEFAULT_SETTINGS.themePresetDark);
  assert.equal(normalized.accentColor, DEFAULT_SETTINGS.accentColor);
  assert.equal(normalized.density, DEFAULT_SETTINGS.density);
  assert.equal(normalized.fontScale, 1.2);
  assert.equal(normalized.indentPx, 10);
  assert.equal(normalized.radiusPx, 16);
  assert.equal(normalized.showFavicons, DEFAULT_SETTINGS.showFavicons);
  assert.equal(normalized.showCloseButton, DEFAULT_SETTINGS.showCloseButton);
  assert.equal(normalized.showGroupHeaders, DEFAULT_SETTINGS.showGroupHeaders);
  assert.equal(normalized.shortcutHintsEnabled, DEFAULT_SETTINGS.shortcutHintsEnabled);
  assert.equal(normalized.confirmCloseSubtree, DEFAULT_SETTINGS.confirmCloseSubtree);
  assert.equal(normalized.confirmCloseBatch, DEFAULT_SETTINGS.confirmCloseBatch);
});
