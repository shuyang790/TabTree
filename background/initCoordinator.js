export function createInitCoordinator({ isInitialized, initialize }) {
  if (typeof isInitialized !== "function" || typeof initialize !== "function") {
    throw new TypeError("createInitCoordinator requires isInitialized and initialize functions");
  }

  let inFlight = null;

  return async function ensureInitialized() {
    if (isInitialized()) {
      return;
    }

    if (!inFlight) {
      inFlight = (async () => {
        await initialize();
      })().finally(() => {
        inFlight = null;
      });
    }

    return inFlight;
  };
}
