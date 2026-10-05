export type PaymentRecord = {
  total?: number | null;
  amount_paid?: number | null;
  change_amount?: number | null;
  remaining_balance?: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
  status?: string | null;
  fulfillment_type?: string | null;
  pos_checkout?: { method?: string; shipping?: { method?: string }; receipt?: { shipping?: { method?: string } } } | null;
};
export type OrderPaymentState = 'paid' | 'partial' | 'unpaid' | 'pending_verification' | 'refunded';
function units(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim()))) return null;
  const amount = Number(value);
  const cents = Math.round((amount + Number.EPSILON) * 100);
  return Number.isFinite(amount) && amount >= 0 && Number.isSafeInteger(cents) ? cents : null;
}
function amounts(order: PaymentRecord) {
  const total = units(order.total), paid = units(order.amount_paid), balance = units(order.remaining_balance);
  // Missing change cannot establish net money received, even when the raw flag says Paid.
  const change = units(order.change_amount);
  const net = paid != null && change != null && change <= paid ? paid - change : null;
  const calculated = total != null && net != null ? Math.max(0, total - net) : null;
  const invalid = [order.total, order.amount_paid, order.change_amount, order.remaining_balance]
    .some(value => value != null && units(value) == null) || (paid != null && change != null && change > paid);
  return { total, net, balance, calculated, invalid };
}

/** POS retains its selected method because the legacy engine stores cash as cod and split as other. */
export function orderPaymentMethod(order: PaymentRecord): string {
  return (order.pos_checkout?.method || order.payment_method || '').trim().toLowerCase();
}

/** Current recorded amounts/status are authoritative; an old receipt is not a new payment. */
export function orderPaymentState(order: PaymentRecord): OrderPaymentState {
  if (order.status === 'refunded' || order.payment_status === 'refunded') return 'refunded';
  if (order.payment_status === 'pending_verification') return 'pending_verification';
  const { net, balance, calculated, invalid } = amounts(order);
  // Neither a stale Paid flag nor one zero-balance field can erase evidence of money due.
  if (invalid || (balance != null && balance > 0) || (calculated != null && calculated > 0)) {
    return net != null && net > 0 ? 'partial' : 'unpaid';
  }
  if (calculated === 0) return 'paid';
  return net != null && net > 0 ? 'partial' : 'unpaid';
}

export function orderPaymentNeedsReview(order: PaymentRecord): boolean {
  if (order.status === 'cancelled' || order.status === 'refunded' || order.payment_status === 'refunded') return false;
  const { balance, calculated, invalid } = amounts(order);
  return invalid || (balance != null && calculated != null && balance !== calculated)
    || calculated == null;
}

export function orderPaymentStatusLabel(order: PaymentRecord): string {
  if (order.payment_status !== 'pending_verification' && orderPaymentNeedsReview(order)) return 'Needs review';
  return { paid: 'Paid', partial: 'Partially paid', unpaid: 'Unpaid', pending_verification: 'Pending verification', refunded: 'Refunded' }[orderPaymentState(order)];
}

export function orderBalanceDue(order: PaymentRecord): number | null {
  if (orderPaymentState(order) === 'refunded' || order.status === 'cancelled') return 0;
  const { balance, calculated } = amounts(order);
  if (balance != null && balance > 0) return balance / 100;
  if (calculated != null) return calculated / 100;
  return balance != null ? balance / 100 : null;
}

export function balanceIsCod(order: PaymentRecord): boolean {
  const method = orderPaymentMethod(order);
  const fulfillment = order.pos_checkout?.receipt?.shipping?.method || order.pos_checkout?.shipping?.method || order.fulfillment_type;
  return method === 'cod' || (method === 'deposit' && fulfillment === 'delivery');
}
