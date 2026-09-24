// PostgREST caps a single response even when the requested limit is larger.
export async function readAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; from < 100_000; from += size) {
    const result = await page(from, from + size - 1);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < size) return { data: rows, error: null };
  }
  return { data: null, error: { message: 'This list is too large to load completely. Narrow the selection.' } };
}
