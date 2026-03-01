export async function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

export async function sendOrThrow(type, payload = {}) {
  const response = await sendMessage(type, payload);
  if (!response) {
    throw new Error(`No response for message type ${type}`);
  }
  if (response.ok === false) {
    const errorPayload = response.error;
    const message = typeof errorPayload === "string"
      ? errorPayload
      : (errorPayload?.message || `Message ${type} failed`);
    const error = new Error(message);
    if (typeof errorPayload?.code === "string") {
      error.code = errorPayload.code;
    }
    if (typeof errorPayload?.actionType === "string") {
      error.actionType = errorPayload.actionType;
    }
    if (Number.isInteger(errorPayload?.windowId)) {
      error.windowId = errorPayload.windowId;
    }
    throw error;
  }
  return response;
}
