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
  /**
   * Where the game has got to, in the words a television caption would use.
   *
   * Empty before kickoff, because the kickoff time already says it better. ESPN gives the period
   * and the clock separately and only sometimes assembles them, so this does it rather than
   * trusting a field that is missing on some games and reads '1st Quarter' on others.
   */
  clock: string;
  /**
   * What this club is expected to score, from the betting line ESPN publishes.
   *
   * The total and the spread give it directly: half the total, plus or minus half the spread.
   * A line of GB -6.5 on a total of 46.5 is Green Bay 26.5 and Atlanta 20, which is the market
   * saying what it thinks the scoreboard will read.
   *
   * Undefined where no book has posted one, and it disappears once a game is over — a projection
   * is a thing said beforehand, and nothing should invent one afterwards.
   */
  projected?: number;
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
    const status = competition?.status;

    // The spread is always quoted for the home side, so the away side takes it the other way.
    const odds = competition?.odds?.[0];
    const total = Number(odds?.overUnder);
    const spread = Number(odds?.spread);
    const priced = Number.isFinite(total) && Number.isFinite(spread);
    const homeProjected = priced ? total / 2 - spread / 2 : undefined;
    const awayProjected = priced ? total / 2 + spread / 2 : undefined;
    const clock =
      state === 'playing'
        ? [status?.period ? (status.period > 4 ? 'OT' : `Q${status.period}`) : '', status?.displayClock ?? '']
            .filter(Boolean).join(' ')
        : state === 'final'
          ? (status?.type?.shortDetail ?? 'Final')
          : '';

    for (const side of sides) {
      const other = sides.find((candidate: { id: string }) => candidate.id !== side.id);
      games.set(side.team.abbreviation, {
        points: Number(side.score) || 0,
        state,
        kickoff,
        against: other?.team?.abbreviation ?? '',
        home: side.homeAway === 'home',
        clock,
        projected: side.homeAway === 'home' ? homeProjected : awayProjected,
      });
    }
  }
  return games;
}

/** Kept for the parts that only care about the score and the state. */
export const clubScores = clubGames;
