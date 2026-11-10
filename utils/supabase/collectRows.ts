type PageResult<T> = { data: T[] | null; error: { message: string } | null };

// Read every page for aggregates and lists that paginate after loading.
export async function collectRows<T>(
  fetchPage: (start: number, end: number) => PromiseLike<PageResult<T>>,
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await fetchPage(start, start + 499);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return { data: rows, error: null };
  }
}
