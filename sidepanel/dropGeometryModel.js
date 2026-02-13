const DEFAULT_DROP_EDGE_RATIO = 0.2;

export function getDropPositionFromCoordinates({
  clientY,
  rectTop,
  rectHeight,
  allowInside = true,
  edgeRatio = DEFAULT_DROP_EDGE_RATIO
}) {
  const y = clientY - rectTop;
  if (y < rectHeight * edgeRatio) {
    return "before";
  }
  if (y > rectHeight * (1 - edgeRatio)) {
    return "after";
  }
  if (!allowInside) {
    return y < rectHeight * 0.5 ? "before" : "after";
  }
  return "inside";
}

export function fallbackEdgePositionFromCoordinates({
  clientY,
  rectTop,
  rectHeight
}) {
  return clientY - rectTop < rectHeight * 0.5 ? "before" : "after";
}

