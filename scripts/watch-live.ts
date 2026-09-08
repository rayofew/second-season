/**
 * Watches a real game to find out whether Sleeper's stats move while it is being played.
 *
 * This is the one assumption the whole live screen rests on and the one nobody has tested. If
 * Sleeper only posts a stat line once a game is final, then a "live" score is really a projection
 * that lurches at midnight, and the screen has to be designed around saying so honestly rather than
 * pretending to a minute-by-minute it does not have.
 *
 * Needs no credentials: both feeds are public and answer the browser, which is why the app can use
 * them at all.
 *
 *   node scripts/watch-live.ts 2026 1
 *
 * Leave it running through a game. It prints a line only when something actually changes, so a
 * silent hour is itself the answer.
 */
import { clubGames } from '../src/providers/schedule.ts';
import { stats } from '../src/providers/sleeper.ts';
import type { StatLine } from '../src/domain/scoring.ts';

const season = Number(process.argv[2] ?? 2026);
const week = Number(process.argv[3] ?? 1);
const EVERY = 60_000;

const at = () => new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Only the fields that move during a game, so a tidy-up of some unrelated field is not "news". */
const WATCHED = ['pass_yd', 'pass_td', 'rush_yd', 'rush_td', 'rec', 'rec_yd', 'rec_td', 'fgm', 'xpm', 'sack'];

const fingerprint = (line: StatLine | undefined): string =>
  WATCHED.map((field) => line?.[field] ?? 0).join(',');

let previous = new Map<string, string>();
let polls = 0;
let firstChangeSeen: string | null = null;

async function poll(): Promise<void> {
  polls += 1;
  const [games, lines] = await Promise.all([
    clubGames(season, week).catch(() => new Map()),
    stats(season, 'regular', week).catch(() => ({}) as Record<string, StatLine>),
  ]);

  const playing = [...games.entries()].filter(([, game]) => game.state === 'playing');
  const inPlay = new Set(playing.map(([club]) => club));

  const current = new Map<string, string>();
  for (const [playerId, line] of Object.entries(lines)) current.set(playerId, fingerprint(line));

  let moved = 0;
  for (const [playerId, mark] of current) {
    if (previous.size === 0) break;
    if (previous.get(playerId) !== mark) moved += 1;
  }

  const clock = playing.map(([club, game]) => `${club} ${game.points} (${game.clock})`).join(' · ');
  if (previous.size === 0) {
    console.log(`${at()}  baseline: ${current.size} stat lines. ${inPlay.size} clubs in play. ${clock}`);
  } else if (moved > 0) {
    if (!firstChangeSeen) {
      firstChangeSeen = at();
      console.log(`\n>>> Sleeper moved DURING play, first seen at ${firstChangeSeen}. Live scoring works.\n`);
    }
    console.log(`${at()}  ${moved} stat lines changed. ${clock || 'no game in play'}`);
  } else if (polls % 10 === 0) {
    console.log(`${at()}  nothing has changed in ten polls. ${clock || 'no game in play'}`);
  }

  previous = current;
}

console.log(`Watching ${season} week ${week}. A line appears only when something changes.\n`);
await poll();
setInterval(() => void poll().catch((cause) => console.log(`${at()}  ${(cause as Error).message}`)), EVERY);
