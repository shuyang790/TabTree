import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { TREE_ACTIONS } from "../shared/constants.js";

test("tree actions include context menu batch and group actions", () => {
  assert.equal(TREE_ACTIONS.BATCH_CLOSE_TABS, "BATCH_CLOSE_TABS");
  assert.equal(TREE_ACTIONS.BATCH_GROUP_NEW, "BATCH_GROUP_NEW");
  assert.equal(TREE_ACTIONS.BATCH_GROUP_EXISTING, "BATCH_GROUP_EXISTING");
  assert.equal(TREE_ACTIONS.MOVE_GROUP_BLOCK, "MOVE_GROUP_BLOCK");
  assert.equal(TREE_ACTIONS.RENAME_GROUP, "RENAME_GROUP");
  assert.equal(TREE_ACTIONS.SET_GROUP_COLOR, "SET_GROUP_COLOR");
});

test("sidepanel html includes context menu container", () => {
  const html = fs.readFileSync(new URL("../sidepanel/index.html", import.meta.url), "utf8");
  assert.match(html, /id="context-menu"/);
});
