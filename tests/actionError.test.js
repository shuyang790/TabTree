import test from "node:test";
import assert from "node:assert/strict";

import { createActionError, toActionErrorPayload } from "../background/actionError.js";

test("createActionError attaches code and details", () => {
  const error = createActionError("TEST_CODE", "test message", {
    actionType: "ACTIVATE_TAB",
    windowId: 9
  });

  assert.equal(error.message, "test message");
  assert.equal(error.code, "TEST_CODE");
  assert.equal(error.actionType, "ACTIVATE_TAB");
  assert.equal(error.windowId, 9);
});

test("toActionErrorPayload normalizes plain errors", () => {
  const payload = toActionErrorPayload(new Error("boom"), "FALLBACK", {
    actionType: "MOVE_TO_ROOT",
    windowId: 4
  });
  assert.deepEqual(payload, {
    code: "FALLBACK",
    message: "boom",
    actionType: "MOVE_TO_ROOT",
    windowId: 4
  });
});

test("toActionErrorPayload prefers structured fields from action errors", () => {
  const error = createActionError("DENIED", "blocked", {
    actionType: "REPARENT_TAB",
    windowId: 12
  });
  const payload = toActionErrorPayload(error, "FALLBACK");
  assert.deepEqual(payload, {
    code: "DENIED",
    message: "blocked",
    actionType: "REPARENT_TAB",
    windowId: 12
  });
});
