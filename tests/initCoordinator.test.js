import test from "node:test";
import assert from "node:assert/strict";
import { createInitCoordinator } from "../background/initCoordinator.js";

test("createInitCoordinator coalesces concurrent initialization calls", async () => {
  let initialized = false;
  let callCount = 0;

  const ensureInitialized = createInitCoordinator({
    isInitialized: () => initialized,
    initialize: async () => {
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      initialized = true;
    }
  });

  await Promise.all([
    ensureInitialized(),
    ensureInitialized(),
    ensureInitialized()
  ]);

  assert.equal(callCount, 1);
  assert.equal(initialized, true);
});

test("createInitCoordinator retries after initialization failure", async () => {
  let initialized = false;
  let callCount = 0;

  const ensureInitialized = createInitCoordinator({
    isInitialized: () => initialized,
    initialize: async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error("transient failure");
      }
      initialized = true;
    }
  });

  await assert.rejects(ensureInitialized(), /transient failure/);
  await ensureInitialized();

  assert.equal(callCount, 2);
  assert.equal(initialized, true);
});

test("createInitCoordinator skips initialize when already initialized", async () => {
  const ensureInitialized = createInitCoordinator({
    isInitialized: () => true,
    initialize: async () => {
      throw new Error("should not run");
    }
  });

  await ensureInitialized();
});
