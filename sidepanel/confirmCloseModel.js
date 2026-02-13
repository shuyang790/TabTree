export function buildConfirmDialogState({
  action,
  isBatch,
  totalTabs,
  activeElement = null,
  formatMessage
}) {
  return {
    pendingCloseAction: { action, isBatch: !!isBatch },
    confirmReturnFocusEl: activeElement,
    message: formatMessage(totalTabs)
  };
}

export function confirmSkipPatch(pendingCloseAction, skipChecked) {
  if (!pendingCloseAction || !skipChecked) {
    return null;
  }
  return pendingCloseAction.isBatch
    ? { confirmCloseBatch: false }
    : { confirmCloseSubtree: false };
}

export function nextFocusWrapIndex(currentIndex, total, shiftKey) {
  if (!Number.isInteger(total) || total <= 0) {
    return -1;
  }
  const delta = shiftKey ? -1 : 1;
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= total) {
    return 0;
  }
  return (currentIndex + delta + total) % total;
}

