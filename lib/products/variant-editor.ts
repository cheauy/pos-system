// Pure helpers shared by the editor and Server Action. No database or UI imports.
export const MAX_EDIT_VARIANTS = 500;
export type EditableVariant = {
  id: string | null;
  size: string;
  color: string;
  sku: string;
  costPrice: string | number;
  sellingPrice: string | number;
  stockQuantity: string | number;
  lowStockQuantity: string | number;
};
const apparelSizes = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL"];
const sizeAliases: Record<string, string> = { "2XS": "XXS", "3XS": "XXXS", "2XL": "XXL", "3XL": "XXXL", "XXXXL": "4XL", "XXXXXL": "5XL" };
export function normalizeVariantText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
export function variantPairKey(row: Pick<EditableVariant, "size" | "color">): string {
  return JSON.stringify([normalizeVariantText(row.color), normalizeVariantText(row.size)]);
}
export function compareVariantSizes(a: string, b: string): number {
  const left = a.trim().toUpperCase(), right = b.trim().toUpperCase();
  const ai = apparelSizes.indexOf(sizeAliases[left] ?? left);
  const bi = apparelSizes.indexOf(sizeAliases[right] ?? right);
  if (ai >= 0 && bi >= 0) return ai - bi;
  if (ai >= 0) return -1;
  if (bi >= 0) return 1;
  return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
}
export function compareColorSize(a: Pick<EditableVariant, "color" | "size" | "sku">, b: Pick<EditableVariant, "color" | "size" | "sku">): number {
  return normalizeVariantText(a.color).localeCompare(normalizeVariantText(b.color), "en", { numeric: true }) ||
    compareVariantSizes(a.size, b.size) || a.sku.localeCompare(b.sku, "en", { numeric: true, sensitivity: "base" });
}
export function splitVariantValues(value: string): string[] {
  const seen = new Set<string>();
  return value.split(/[,\n]+/).map(v => v.trim().replace(/\s+/g, " ")).filter(v => {
    const key = normalizeVariantText(v);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function missingVariantCombinations(rows: Pick<EditableVariant, "color" | "size">[], colors: string[], sizes: string[]) {
  const seen = new Set(rows.map(variantPairKey));
  const additions: { color: string; size: string }[] = [];
  for (const color of colors) for (const size of sizes) {
    const pair = { color, size }, key = variantPairKey(pair);
    if (!seen.has(key)) { additions.push(pair); seen.add(key); }
  }
  return additions;
}
export function validateEditableVariants(rows: EditableVariant[], requireOptions: boolean): string | null {
  if (!rows.length || rows.length > MAX_EDIT_VARIANTS) return `Keep between 1 and ${MAX_EDIT_VARIANTS} variants.`;
  const skus = new Set<string>(), pairs = new Set<string>(), ids = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], label = `${row.color.trim()} ${row.size.trim()}`.trim() || `Row ${i + 1}`;
    if (!row.sku.trim()) return `${label}: enter a SKU.`;
    if (row.sku.trim().length > 80) return `${label}: keep the SKU within 80 characters.`;
    const sku = normalizeVariantText(row.sku);
    if (skus.has(sku)) return `Duplicate SKU: ${row.sku.trim()}. Each row needs its own SKU.`;
    skus.add(sku);
    if (row.id) { if (ids.has(row.id)) return "The same saved variant was submitted twice."; ids.add(row.id); }
    if (requireOptions && (!row.size.trim() || !row.color.trim())) return `${label}: enter both colour and size.`;
    if (requireOptions) {
      const pair = variantPairKey(row);
      if (pairs.has(pair)) return `${label}: this colour and size combination already exists.`;
      pairs.add(pair);
    }
    for (const [field, title, integer] of [
      ["costPrice", "cost price", false], ["sellingPrice", "selling price", false],
      ["stockQuantity", "initial stock", true], ["lowStockQuantity", "low-stock alert", true],
    ] as const) {
      // Saved stock is read-only and must never be written by this editor.
      if (field === "stockQuantity" && row.id) continue;
      const raw = row[field], n = Number(raw);
      if (String(raw).trim() === "" || !Number.isFinite(n) || n < 0 || (integer && !Number.isSafeInteger(n))) {
        return `${label}: enter a valid non-negative ${integer ? "whole number for " : ""}${title}.`;
      }
    }
  }
  return null;
}
