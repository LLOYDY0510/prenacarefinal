import { collectRows } from './collectRows';

export async function collectInRows<T>(ids: string[], fetchPage: (batch: string[], start: number, end: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100);
    const result = await collectRows((start, end) => fetchPage(batch, start, end));
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
  }
  return { data: rows, error: null };
}
