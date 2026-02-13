import test from "node:test";
import assert from "node:assert/strict";
import { sendOrThrow } from "../sidepanel/messaging.js";

test("sendOrThrow returns response for successful messages", async () => {
  const previousChrome = globalThis.chrome;
  try {
    globalThis.chrome = {
      runtime: {
        sendMessage: async ({ type, payload }) => ({
          ok: true,
          payload: { echo: `${type}:${payload.value}` }
        })
      }
    };

    const response = await sendOrThrow("PING", { value: "ok" });
    assert.equal(response.ok, true);
    assert.deepEqual(response.payload, { echo: "PING:ok" });
  } finally {
    globalThis.chrome = previousChrome;
  }
});

test("sendOrThrow throws when no response is returned", async () => {
  const previousChrome = globalThis.chrome;
  try {
    globalThis.chrome = {
      runtime: {
        sendMessage: async () => undefined
      }
    };

    await assert.rejects(sendOrThrow("PING"), /No response/);
  } finally {
    globalThis.chrome = previousChrome;
  }
});

test("sendOrThrow throws when response.ok is false", async () => {
  const previousChrome = globalThis.chrome;
  try {
    globalThis.chrome = {
      runtime: {
        sendMessage: async () => ({ ok: false, error: "Denied" })
      }
    };

    await assert.rejects(sendOrThrow("PING"), /Denied/);
  } finally {
    globalThis.chrome = previousChrome;
  }
});
