// Share invalidations from the existing Orders and dashboard alert listeners.
// This carries no order data and falls back to the caller's refresh elsewhere.
export const ORDERS_REFRESH_EVENT = 'tenh-orders-refresh';
export function requestOrdersWorkspaceRefresh(businessId: string, branchId: string): boolean {
  return !window.dispatchEvent(new CustomEvent(ORDERS_REFRESH_EVENT, {
    cancelable: true, detail: { businessId, branchId },
  }));
}

export function createOrdersRefreshScheduler(refresh: (detail: boolean) => void, isVisible: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let detailNeeded = false;
  let disposed = false;
  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (disposed || !isVisible()) return;
    const detail = detailNeeded;
    detailNeeded = false;
    refresh(detail);
  };
  return {
    request(detail = false, immediate = false) {
      if (disposed) return;
      detailNeeded ||= detail;
      if (timer !== null) clearTimeout(timer);
      if (immediate) flush(); else timer = setTimeout(flush, 700);
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
