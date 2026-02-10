function resolveCurrentWindowId(windows, panelWindowId, focusedWindowId) {
  if (Number.isInteger(panelWindowId) && windows?.[panelWindowId]) {
    return panelWindowId;
  }
  if (Number.isInteger(focusedWindowId) && windows?.[focusedWindowId]) {
    return focusedWindowId;
  }
  const firstWindowId = Object.keys(windows || {})[0];
  if (!firstWindowId) {
    return null;
  }
  const parsed = Number(firstWindowId);
  return Number.isInteger(parsed) ? parsed : null;
}

export function applyRuntimeStateUpdate(current, payload) {
  const settings = payload.settings || current.settings;
  let windows = current.windows || {};

  if (payload.partial && Number.isInteger(payload.changedWindowId) && payload.windows) {
    windows = { ...windows };
    if (payload.windows[payload.changedWindowId]) {
      windows[payload.changedWindowId] = payload.windows[payload.changedWindowId];
    } else {
      delete windows[payload.changedWindowId];
    }
  } else if (payload.windows) {
    windows = payload.windows;
  }

  const focusedWindowId = Number.isInteger(payload.focusedWindowId)
    ? payload.focusedWindowId
    : current.focusedWindowId;

  const currentWindowBefore = resolveCurrentWindowId(
    current.windows || {},
    current.panelWindowId,
    current.focusedWindowId
  );
  const currentWindowAfter = resolveCurrentWindowId(
    windows,
    current.panelWindowId,
    focusedWindowId
  );

  let shouldRender = true;
  if (payload.partial && !payload.settings) {
    shouldRender = (
      !Number.isInteger(payload.changedWindowId) ||
      currentWindowBefore === null ||
      currentWindowAfter === null ||
      currentWindowBefore !== currentWindowAfter ||
      payload.changedWindowId === currentWindowBefore
    );
  }

  return {
    settings,
    windows,
    focusedWindowId,
    shouldRender
  };
}
