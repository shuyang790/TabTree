import { SYNC_SNAPSHOT_KEY } from "./constants.js";
import { storageBytes } from "./localStorageBudget.js";

export const SYNC_SNAPSHOT_BUDGET_BYTES = 8 * 1024;

// Keep the snapshot format and a parent-first prefix of the newest windows. Sync is a
// lightweight recovery hint; the complete canonical trees remain in local.
export function boundSyncSnapshot(snapshot) {
  const bounded = { ...snapshot, windows: [] };
  let bytes = storageBytes({ [SYNC_SNAPSHOT_KEY]: bounded });

  for (const window of snapshot.windows) {
    const retained = { ...window, n: [] };
    const windowBytes = storageBytes({ "": retained }) + (bounded.windows.length ? 1 : 0);
    if (bytes + windowBytes > SYNC_SNAPSHOT_BUDGET_BYTES) break;
    bounded.windows.push(retained);
    bytes += windowBytes;

    for (const node of window.n) {
      // Include array separators as well as Chrome's UTF-8/JSON escaping costs.
      const nodeBytes = storageBytes({ "": node }) + (retained.n.length ? 1 : 0);
      if (bytes + nodeBytes > SYNC_SNAPSHOT_BUDGET_BYTES) return bounded;
      retained.n.push(node);
      bytes += nodeBytes;
    }
  }

  return bounded;
}
