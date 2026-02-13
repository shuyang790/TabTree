export function normalizedDepth(depth, options = {}) {
  const { maxVisualDepth = 8 } = options;
  const value = Number.isFinite(depth) ? Math.trunc(depth) : 1;
  return Math.max(1, Math.min(maxVisualDepth, value));
}

export function safeFaviconUrl(node, options = {}) {
  const { showFavicons = true } = options;
  const shouldShow = !!node?.pinned || !!showFavicons;
  const rawUrl = shouldShow ? node?.favIconUrl || "" : "";
  return rawUrl && !rawUrl.startsWith("chrome://") && !rawUrl.startsWith("chrome-extension://")
    ? rawUrl
    : "";
}

