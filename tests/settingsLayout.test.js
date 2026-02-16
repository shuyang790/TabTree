import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../sidepanel/index.html", import.meta.url), "utf8");

test("behavior settings keep advanced toggles under collapsed details", () => {
  const behaviorAdvancedBlock = html.match(
    /<details class="settings-advanced" id="behavior-advanced">[\s\S]*?<\/details>/
  )?.[0] ?? "";

  assert.match(behaviorAdvancedBlock, /data-i18n="advancedBehavior"/);
  assert.match(behaviorAdvancedBlock, /name="showDragStatusChip"/);
  assert.match(behaviorAdvancedBlock, /name="shortcutHintsEnabled"/);
});
