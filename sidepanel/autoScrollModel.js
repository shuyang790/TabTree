function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function computeAutoScrollTargetDelta({
  clientY,
  rectTop,
  rectBottom,
  edgePx = 56,
  minStep = 1,
  maxStep = 18,
  curve = 2.1
}) {
  if (
    !Number.isFinite(clientY)
    || !Number.isFinite(rectTop)
    || !Number.isFinite(rectBottom)
    || !Number.isFinite(edgePx)
    || edgePx <= 0
  ) {
    return 0;
  }

  const effectiveMinStep = Math.max(0, Number.isFinite(minStep) ? minStep : 0);
  const effectiveMaxStep = Math.max(effectiveMinStep, Number.isFinite(maxStep) ? maxStep : effectiveMinStep);
  const effectiveCurve = Math.max(1, Number.isFinite(curve) ? curve : 2.1);

  const topBoundary = rectTop + edgePx;
  const bottomBoundary = rectBottom - edgePx;

  if (clientY < topBoundary) {
    const ratio = clamp01((topBoundary - clientY) / edgePx);
    if (ratio <= 0) {
      return 0;
    }
    const magnitude = effectiveMinStep + (effectiveMaxStep - effectiveMinStep) * Math.pow(ratio, effectiveCurve);
    return -Math.round(magnitude);
  }

  if (clientY > bottomBoundary) {
    const ratio = clamp01((clientY - bottomBoundary) / edgePx);
    if (ratio <= 0) {
      return 0;
    }
    const magnitude = effectiveMinStep + (effectiveMaxStep - effectiveMinStep) * Math.pow(ratio, effectiveCurve);
    return Math.round(magnitude);
  }

  return 0;
}

export function blendAutoScrollVelocity(
  currentVelocity,
  targetDelta,
  options = {}
) {
  const current = Number.isFinite(currentVelocity) ? currentVelocity : 0;
  const target = Number.isFinite(targetDelta) ? targetDelta : 0;
  const accel = Math.min(0.9, Math.max(0.05, Number(options.accel ?? 0.42)));
  const decel = Math.min(0.95, Math.max(0.05, Number(options.decel ?? 0.5)));
  const snapEpsilon = Math.max(0, Number(options.snapEpsilon ?? 0.45));

  if (target === 0) {
    const decayed = current * decel;
    return Math.abs(decayed) < snapEpsilon ? 0 : decayed;
  }

  let seed = current;
  if (Math.sign(seed) !== Math.sign(target) && seed !== 0) {
    seed *= 0.5;
  }

  const next = seed + (target - seed) * accel;
  if (Math.abs(next) < snapEpsilon && Math.abs(target) < 1) {
    return 0;
  }
  return next;
}
