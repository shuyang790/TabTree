import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizedDepth,
  safeFaviconUrl
} from "../sidepanel/rowPresentationModel.js";

test("normalizedDepth clamps depth to visual bounds", () => {
  assert.equal(normalizedDepth(3, { maxVisualDepth: 8 }), 3);
  assert.equal(normalizedDepth(0, { maxVisualDepth: 8 }), 1);
  assert.equal(normalizedDepth(99, { maxVisualDepth: 8 }), 8);
  assert.equal(normalizedDepth(NaN, { maxVisualDepth: 8 }), 1);
});

test("safeFaviconUrl hides favicons based on settings and protected schemes", () => {
  const httpNode = { pinned: false, favIconUrl: "https://example.com/icon.png" };
  const chromeNode = { pinned: false, favIconUrl: "chrome://favicon/https://example.com" };
  const extensionNode = { pinned: false, favIconUrl: "chrome-extension://abc/icon.png" };
  const pinnedNode = { pinned: true, favIconUrl: "https://example.com/pinned.png" };

  assert.equal(safeFaviconUrl(httpNode, { showFavicons: true }), "https://example.com/icon.png");
  assert.equal(safeFaviconUrl(httpNode, { showFavicons: false }), "");
  assert.equal(safeFaviconUrl(chromeNode, { showFavicons: true }), "");
  assert.equal(safeFaviconUrl(extensionNode, { showFavicons: true }), "");
  assert.equal(safeFaviconUrl(pinnedNode, { showFavicons: false }), "https://example.com/pinned.png");
});

