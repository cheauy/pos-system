type Receipt = { orderNumber: string; publicToken: string; total: number; currency: string };
export async function sendOrderEmail(email: string, order: Receipt, storeUrl: string): Promise<"sent" | "unavailable"> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_EMAIL_FROM;
  if (!key || !from) return "unavailable";
  const trackingUrl = new URL(`/order/${encodeURIComponent(order.publicToken)}`, storeUrl).href;
  const text = `Your order was placed successfully.\n\nTracking ID: ${order.orderNumber}\nTotal: ${order.currency} ${Number(order.total).toFixed(2)}\n\nPlease wait for the store to call and confirm your order details.\nTrack your order anytime: ${trackingUrl}\n\nWant faster confirmation? Open your tracking page for store contact links. Copy your tracking ID and send it to the store so they can find your order quickly.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `storefront-receipt-${order.publicToken}` }, body: JSON.stringify({ from, to: [email], subject: `Order ${order.orderNumber} placed successfully`, text }), signal: AbortSignal.timeout(8000) });
      if (response.ok) return "sent";
      if (response.status < 500 && response.status !== 429) return "unavailable";
    } catch { /* A receipt failure must never make a completed checkout fail. */ }
  }
  return "unavailable";
}
