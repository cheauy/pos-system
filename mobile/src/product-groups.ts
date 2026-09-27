export type GroupableProduct = { id: string; variant_group_id?: string | null };

// Use the same identity as web POS; unrelated products may share a name.
export function groupProducts<T extends GroupableProduct>(products: T[]) {
  const groups = new Map<string, T[]>();
  for (const product of products) {
    const key = product.variant_group_id ? `variant:${product.variant_group_id}` : product.id;
    const group = groups.get(key);
    if (group) group.push(product);
    else groups.set(key, [product]);
  }
  return [...groups.values()];
}
