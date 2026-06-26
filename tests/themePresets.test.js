import test from "node:test";
import assert from "node:assert/strict";

import {
  THEME_PRESET_DARK_KEYS,
  THEME_PRESET_LIGHT_KEYS
} from "../shared/constants.js";
import { THEME_PRESETS } from "../sidepanel/themes.js";

const TOKEN_KEYS = [
  "mode",
  "bg",
  "bgElev",
  "text",
  "textMuted",
  "border",
  "rowHover",
  "rowActive",
  "shadow",
  "focusRing",
  "accent"
];

test("theme preset constants match token definitions", () => {
  const configuredPresetKeys = new Set([
    ...THEME_PRESET_LIGHT_KEYS.filter((key) => key !== "base-light"),
    ...THEME_PRESET_DARK_KEYS.filter((key) => key !== "base-dark")
  ]);

  assert.deepEqual(
    Object.keys(THEME_PRESETS).sort(),
    [...configuredPresetKeys].sort()
  );
});

test("theme presets expose complete token maps", () => {
  for (const [presetKey, tokens] of Object.entries(THEME_PRESETS)) {
    assert.ok(
      tokens.mode === "light" || tokens.mode === "dark",
      `${presetKey} should declare a light or dark mode`
    );

    for (const tokenKey of TOKEN_KEYS) {
      assert.equal(typeof tokens[tokenKey], "string", `${presetKey}.${tokenKey}`);
      assert.notEqual(tokens[tokenKey], "", `${presetKey}.${tokenKey}`);
    }
  }
});
