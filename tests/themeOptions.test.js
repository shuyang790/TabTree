import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../sidepanel/index.html", import.meta.url), "utf8");

function countMatches(pattern) {
  const matches = html.match(pattern);
  return matches ? matches.length : 0;
}

test("theme selectors include all expected families and variants in both dropdowns", () => {
  const presetValues = [
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

  for (const value of presetValues) {
    assert.equal(
      countMatches(new RegExp(`<option value="${value}">`, "g")),
      2,
      `Expected ${value} to exist in both light and dark selectors`
    );
  }
});

test("theme labels include family name and avoid bare Light/Dark labels", () => {
  const expectedLabels = [
    "Catppuccin — Latte",
    "Catppuccin — Frappe",
    "Catppuccin — Macchiato",
    "Catppuccin — Mocha",
    "Everforest — Light",
    "Everforest — Dark",
    "Gruvbox — Light",
    "Gruvbox — Dark",
    "Tokyo Night — Day",
    "Tokyo Night — Night",
    "Kanagawa — Lotus",
    "Kanagawa — Wave",
    "One — Light",
    "One — Dark"
  ];

  for (const label of expectedLabels) {
    assert.match(html, new RegExp(`>\\s*${label}\\s*<`));
  }

  assert.equal(
    /<option[^>]*>\s*(Light|Dark)\s*<\/option>/.test(html),
    false,
    "Dropdown labels should include family name, not bare Light/Dark"
  );
});
