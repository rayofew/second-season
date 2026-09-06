import type { ClubState } from '../domain/live.ts';

/**
 * What each club scored, and where its game has got to.
 *
 * ESPN answers cross-origin requests, so the browser can ask directly and no server is needed to
 * decide a round or to show a live score.
 *
 * Three states rather than two, because "has not kicked off" and "is playing" want different things
 * on screen: the first is carried at a projection, the second at whatever has actually happened.
 */

export interface ClubResult {
  points: number;
  state: ClubState;
}

const STATES: Record<string, ClubState> = { pre: 'upcoming', in: 'playing', post: 'final' };

export async function clubScores(season: number, week: number): Promise<Map<string, ClubResult>> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
  const payload = await (await fetch(url, { signal: AbortSignal.timeout(20_000) })).json();

  const results = new Map<string, ClubResult>();
  for (const event of payload.events ?? []) {
    const competition = event.competitions?.[0];
    const state = STATES[competition?.status?.type?.state as string] ?? 'upcoming';
    for (const side of competition?.competitors ?? []) {
      results.set(side.team.abbreviation, { points: Number(side.score) || 0, state });
    }
  }
  return results;
}
