export type VariantChoice = { id: string; size: string | null; color: string | null; available?: number };
export function matchingVariants<T extends VariantChoice>(rows: T[], color: string | null, size: string | null) {
  return rows.filter(row => (color === null || (row.color || '') === color) && (size === null || (row.size || '') === size));
}
