import { matchesSearch, normalizeSearch } from '@/utils/tables/search';

export type FilterableBroadcast = {
  title: string;
  content: string;
  month: number;
  period: string;
  risk_level: string;
};

/* One search box across message text, scheduling facts, and recipient names. */
export function broadcastMatches(
  broadcast: FilterableBroadcast,
  recipientNames: string[],
  query: string,
): boolean {
  if (!normalizeSearch(query)) return true;
  return matchesSearch(
    query,
    broadcast.title,
    broadcast.content,
    String(broadcast.month),
    broadcast.period,
    broadcast.risk_level,
    recipientNames.join(' '),
  );
}
