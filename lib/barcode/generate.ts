// Internal Code 39 identifier, not a retail UPC/EAN or GS1 identifier.
export function generateInternalBarcode(): string {
  return parseInt(crypto.randomUUID().replaceAll("-", "").slice(0, 12), 16).toString().padStart(15, "0");
}
