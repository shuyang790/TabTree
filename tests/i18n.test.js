import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function readJson(path) {
  return JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
}

function assertMessageToken(value, label) {
  assert.match(value, /^__MSG_[A-Za-z0-9_]+__$/, `${label} should use a __MSG_*__ token`);
}

function discoveredLocaleIds() {
  return fs.readdirSync(new URL("../_locales/", import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

test("manifest enables i18n and localizes user-facing metadata", () => {
  const manifest = readJson("../manifest.json");

  assert.equal(manifest.default_locale, "en");
  assertMessageToken(manifest.name, "manifest.name");
  assertMessageToken(manifest.description, "manifest.description");
  assertMessageToken(manifest.action.default_title, "manifest.action.default_title");

  for (const [commandId, config] of Object.entries(manifest.commands || {})) {
    assertMessageToken(config.description, `manifest.commands.${commandId}.description`);
  }
});

test("locale files exist and keep the same message keys", () => {
  const localeIds = discoveredLocaleIds();
  assert.ok(localeIds.includes("en"), "default en locale should exist");
  assert.ok(localeIds.length >= 1, "at least one locale directory should exist");
  const localeMessages = localeIds.map((localeId) => ({
    localeId,
    messages: readJson(`../_locales/${localeId}/messages.json`)
  }));

  const baseKeys = Object.keys(localeMessages[0].messages).sort();
  for (const { localeId, messages } of localeMessages) {
    assert.deepEqual(Object.keys(messages).sort(), baseKeys, `${localeId} should have the same message keys as en`);

    for (const key of baseKeys) {
      assert.equal(typeof messages[key]?.message, "string", `${localeId}.${key}.message should be a string`);
      assert.notEqual(messages[key].message.trim(), "", `${localeId}.${key}.message should not be empty`);
    }
  }
});
