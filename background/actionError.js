export function createActionError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

export function toActionErrorPayload(error, fallbackCode, details = {}) {
  const message = error instanceof Error
    ? error.message
    : String(error || "Unknown error");
  const payload = {
    code: typeof error?.code === "string" ? error.code : fallbackCode,
    message
  };

  const actionType = details.actionType ?? error?.actionType;
  const windowId = details.windowId ?? error?.windowId;
  if (typeof actionType === "string" && actionType) {
    payload.actionType = actionType;
  }
  if (Number.isInteger(windowId)) {
    payload.windowId = windowId;
  }
  return payload;
}
