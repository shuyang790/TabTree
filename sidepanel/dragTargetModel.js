export function emptyDragTarget() {
  return {
    kind: null,
    tabId: null,
    groupId: null,
    position: null,
    valid: false
  };
}

export function normalizeDragTarget(target = null) {
  if (!target) {
    return emptyDragTarget();
  }

  return {
    kind: target.kind || null,
    tabId: Number.isFinite(target.tabId) ? target.tabId : null,
    groupId: Number.isInteger(target.groupId) ? target.groupId : null,
    position: target.position || null,
    valid: !!target.valid
  };
}

export function sameDragTarget(a, b) {
  return a.kind === b.kind
    && a.tabId === b.tabId
    && a.groupId === b.groupId
    && a.position === b.position
    && a.valid === b.valid;
}

export function dropClassesForTarget(target) {
  if (!target || target.kind === null || target.kind === "root") {
    return [];
  }
  if (!target.valid) {
    return ["drop-invalid"];
  }
  if (target.position === "before") {
    return ["drop-valid-before"];
  }
  if (target.position === "after") {
    return ["drop-valid-after"];
  }
  if (target.position === "inside") {
    return ["drop-valid-inside"];
  }
  return [];
}
