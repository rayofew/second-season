import type { ClubState } from '../domain/live.ts';

/**
 * Every club's fixture for a week: who they play, when, and where the game has got to.
 *
 * ESPN answers cross-origin requests, so the browser asks directly and no server is needed to show
 * a live score or decide a round.
 *
 * Three states rather than two, because "has not kicked off" and "is playing" want different things
 * on screen: the first is carried at a projection, the second at whatever has actually happened.
 */

export interface ClubGame {
  points: number;
  state: ClubState;
  kickoff: Date;
  /** The other club, with an at or a v so it reads the way people say it. */
  against: string;
  home: boolean;
}

const STATES: Record<string, ClubState> = { pre: 'upcoming', in: 'playing', post: 'final' };

export async function clubGames(season: number, week: number): Promise<Map<string, ClubGame>> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
  const payload = await (await fetch(url, { signal: AbortSignal.timeout(20_000) })).json();

  const games = new Map<string, ClubGame>();
  for (const event of payload.events ?? []) {
    const competition = event.competitions?.[0];
    const state = STATES[competition?.status?.type?.state as string] ?? 'upcoming';
    const kickoff = new Date(event.date);
    const sides = competition?.competitors ?? [];

    for (const side of sides) {
      const other = sides.find((candidate: { id: string }) => candidate.id !== side.id);
      games.set(side.team.abbreviation, {
        points: Number(side.score) || 0,
        state,
        kickoff,
        against: other?.team?.abbreviation ?? '',
        home: side.homeAway === 'home',
      });
    }
  }
  return games;
}

/** Kept for the parts that only care about the score and the state. */
export const clubScores = clubGames;
