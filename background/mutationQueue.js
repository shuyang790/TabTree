function queueKey(windowId) {
  return Number.isInteger(windowId) ? `window:${windowId}` : "global";
}

export function createWindowMutationQueue({ onError = () => {} } = {}) {
  const queues = new Map();
  const executing = new Set();

  function run(windowId, operation, context = {}) {
    if (typeof operation !== "function") {
      throw new TypeError("mutation queue operation must be a function");
    }

    const key = queueKey(windowId);
    const previous = queues.get(key) || Promise.resolve();
    const next = previous
      .catch(() => {
        // Keep chains alive after failures.
      })
      .then(async () => {
        executing.add(key);
        try {
          return await operation();
        } finally {
          executing.delete(key);
        }
      });

    queues.set(key, next);

    return next
      .catch((error) => {
        onError(error, { ...context, queueKey: key, windowId });
        throw error;
      })
      .finally(() => {
        if (queues.get(key) === next) {
          queues.delete(key);
        }
      });
  }

  function isExecuting(windowId) {
    return executing.has(queueKey(windowId));
  }

  function pendingQueues() {
    return queues.size;
  }

  return {
    isExecuting,
    pendingQueues,
    run
  };
}
