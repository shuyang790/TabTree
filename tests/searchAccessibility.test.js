import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../sidepanel/index.html", import.meta.url), "utf8");

test("search input provides explicit accessible labeling", () => {
  assert.match(html, /<input[^>]*id="search"[^>]*aria-label="[^"]+"/);
  assert.match(html, /<input[^>]*id="search"[^>]*data-i18n-aria-label="searchAriaLabel"/);
  assert.match(html, /<input[^>]*id="search"[^>]*aria-describedby="search-drop-hint"/);
});

test("search drop hint remains visible and localized", () => {
  assert.match(html, /<div[^>]*id="search-drop-hint"[^>]*data-i18n="searchDropHint"/);
  assert.equal(/<div[^>]*id="search-drop-hint"[^>]*hidden/.test(html), false);
});
