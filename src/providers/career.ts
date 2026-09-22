import type { RawCategory } from '../domain/career.ts';
import type { RawLog } from '../domain/gamelog.ts';

/**
 * A player's career, from ESPN.
 *
 * Asked for one man at a time, when somebody opens his card. Sleeper's stats are per week and per
 * league; ESPN keeps the seasons, publishes them cross-origin, and answers in about a tenth of a
 * second — so the browser asks directly and no server is needed for this either.
 *
 * Kept for the life of the page. A career does not change while somebody is deciding on a flex.
 */

const remembered = new Map<string, RawCategory[]>();

export async function careerOf(espnId: string): Promise<RawCategory[]> {
  const known = remembered.get(espnId);
  if (known) return known;

  const response = await fetch(
    `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${espnId}/stats`,
    { signal: AbortSignal.timeout(8_000) },
  );
  if (!response.ok) throw new Error(`ESPN said ${response.status}`);

  const data = await response.json() as { categories?: RawCategory[] };
  const categories = data.categories ?? [];
  remembered.set(espnId, categories);
  return categories;
}

/**
 * One season of his, game by game.
 *
 * A second request, made only when somebody presses a year — most people look at the four totals
 * and close the card, and a season nobody opened is a request nobody should have paid for.
 */
const logs = new Map<string, RawLog>();

export async function seasonOf(espnId: string, year: number): Promise<RawLog> {
  const key = `${espnId}:${year}`;
  const known = logs.get(key);
  if (known) return known;

  const response = await fetch(
    `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${espnId}/gamelog?season=${year}`,
    { signal: AbortSignal.timeout(8_000) },
  );
  if (!response.ok) throw new Error(`ESPN said ${response.status}`);

  const raw = await response.json() as RawLog;
  logs.set(key, raw);
  return raw;
}
