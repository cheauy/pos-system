export const PAYMENT_PROOF_BUCKET = "storefront-payment-proofs";
export function proofPath(reference: string | null | undefined) {
  return /^proof:[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(reference ?? "") ? reference!.slice(6) : null;
}
export function validateCheckoutContact(name: unknown, phone: unknown, fulfillment: unknown, address: unknown) {
  if (typeof name !== "string" || !name.trim()) return "Enter your name.";
  if (typeof phone !== "string" || !/^[+\d\s().-]+$/.test(phone.trim()) || phone.replace(/\D/g, "").length < 7 || phone.replace(/\D/g, "").length > 15) return "Enter a valid phone number.";
  if (!["pickup", "delivery", "dine_in"].includes(String(fulfillment))) return "Choose pickup or delivery.";
  if (fulfillment === "delivery" && (typeof address !== "string" || !address.trim())) return "Enter your delivery address.";
  return null;
}
export function formatOrderDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}
