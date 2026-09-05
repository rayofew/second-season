/**
 * What each club scored, and whether it has finished.
 *
 * ESPN answers cross-origin requests, so the commissioner's browser can ask directly and no server
 * is needed to decide a round. Whether a game has finished matters as much as the score: our clubs
 * play on different days, so on a Sunday night half the bracket may still be undecided, and saying
 * so is better than quietly counting nothing as nought.
 */

export interface ClubResult {
  points: number;
  finished: boolean;
}

export async function clubScores(season: number, week: number): Promise<Map<string, ClubResult>> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
  const payload = await (await fetch(url, { signal: AbortSignal.timeout(20_000) })).json();

  const results = new Map<string, ClubResult>();
  for (const event of payload.events ?? []) {
    const competition = event.competitions?.[0];
    const finished = competition?.status?.type?.completed === true;
    for (const side of competition?.competitors ?? []) {
      results.set(side.team.abbreviation, { points: Number(side.score) || 0, finished });
    }
  }
  return results;
}
