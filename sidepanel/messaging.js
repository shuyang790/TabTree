export async function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

export async function sendOrThrow(type, payload = {}) {
  const response = await sendMessage(type, payload);
  if (!response) {
    throw new Error(`No response for message type ${type}`);
  }
  if (response.ok === false) {
    throw new Error(response.error || `Message ${type} failed`);
  }
  return response;
}
