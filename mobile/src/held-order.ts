type Item = { productId: string; quantity: number; optionIds: string[] };
export type HoldRequest = {
  requestId: string; holdId: string | null; holdVersion: number | null; label: string; currency: string;
  items: Item[]; customerId: string | null; paymentMethod: string; shipping: Record<string, string>;
  deliveryFee: number; discount: number; discountType: string; couponCode: string; redeemPoints: number;
};
export type SavedHold = { id: string; version: number; label: string; draft: {
  branchId: string; baseCurrency?: string; lines: Item[]; customerId: string; paymentMethod: string;
  shipping?: Record<string, string | undefined>; deliveryFee: string; discount: string;
  discountType?: string; couponCode?: string; points: string; note?: string;
} };

export function matchesHeldOrder(held: SavedHold, request: HoldRequest, branchId: string) {
  const draft = held.draft;
  const items = (rows: Item[]) => JSON.stringify(rows.map(row => [row.productId, row.quantity, [...row.optionIds].sort()]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  return held.id === (request.holdId || request.requestId) && held.version > (request.holdVersion || 0)
    && held.label.trim() === request.label.trim() && draft.branchId === branchId && draft.baseCurrency === request.currency
    && items(draft.lines) === items(request.items) && (draft.customerId || null) === request.customerId
    && draft.paymentMethod === request.paymentMethod && Number(draft.deliveryFee) === request.deliveryFee
    && Number(draft.discount) === request.discount && (draft.discountType || 'amount') === request.discountType
    && (draft.couponCode || '') === request.couponCode && Number(draft.points) === request.redeemPoints && !draft.note
    && ['method', 'recipientName', 'phone', 'address', 'carrier', 'carrierOther'].every(key => (draft.shipping?.[key] || '') === (request.shipping[key] || ''));
}
