// Internal numeric identifier, not a retail UPC/EAN or GS1 identifier.
// Randomness is not uniqueness: the database reservation contract arbitrates writes.
export function generateInternalBarcode(): string {
  return parseInt(crypto.randomUUID().replaceAll("-", "").slice(0, 12), 16).toString().padStart(15, "0");
}
