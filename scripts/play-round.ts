/**
 * Plays a round on behalf of the stand-in managers, so the test has a league in it.
 *
 * Random picks every week would prove almost nothing. The whole game is the multiplier, and the
 * multiplier only means something when different managers treat it differently — so each stand-in
 * is given a temperament and keeps it all the way through:
 *
 *   loyal    never drops anybody who is still alive. Reaches 4x, and tests that the streak survives
 *            a bye and a round with no changes at all.
 *   chaser   takes whoever is projected highest this week, every week. Permanently at 1x, and the
 *            thing the loyalist is supposed to beat.
 *   patcher  keeps everyone still alive and only replaces the men who were knocked out. What most
 *            real managers will actually do.
 *   fiddler  patches, and also swaps his worst-projected man each week. Mixed multipliers, which is
 *            the case the standings arithmetic is easiest to get wrong on.
 *   absent   submits nothing at all, so the round has somebody who forgot — a path that is
 *            otherwise never exercised until it happens to a real person in January.
 *
 * Run it after advancing, once the new round is open:
 *
 *   node scripts/play-round.ts --dry-run     # prints what each would do, writes nothing
 *   node scripts/play-round.ts               # does it
 *   node scripts/play-round.ts 2             # a particular round
 */
import { admin } from './admin.ts';
import { EASTSIDE } from '../src/domain/rules.ts';
import { projectedPoints } from '../src/domain/scoring.ts';
import { standingsFor } from '../src/domain/multiplier.ts';
import type { HeldPlayer } from '../src/domain/multiplier.ts';
import type { Position } from '../src/domain/rules.ts';
import type { StatLine } from '../src/domain/scoring.ts';
import { projections } from '../src/providers/sleeper.ts';

const CONTEST = 'rehearsal-2026';
const PREFIX = 'stand-in-';
const dry = process.argv.includes('--dry-run');

type Temperament = 'loyal' | 'chaser' | 'patcher' | 'fiddler' | 'absent';

/** Fixed by position in the field, so a manager's character never changes between rounds. */
const TEMPERAMENTS: Temperament[] = ['loyal', 'chaser', 'patcher', 'fiddler', 'patcher', 'absent'];

const db = admin();
const contest = (await db.doc(`contests/${CONTEST}`).get()).data();
if (!contest) throw new Error('No contest');

const round = Number(process.argv.find((arg) => /^\d+$/.test(arg)) ?? contest.currentRound);
const config = contest.rounds[round];
if (!config) throw new Error(`No round ${round}`);

const pool = ((await db.doc(`contests/${CONTEST}/pool/current`).get()).data()?.players ?? []) as
  { id: string; name: string; position: string; team: string }[];
const byId = new Map(pool.map((player) => [player.id, player]));
const teams = (await db.doc(`contests/${CONTEST}/teams/${round}`).get()).data() as
  { alive: string[]; byes: string[] } | undefined;
const alive = new Set(teams?.alive ?? []);
const byes = new Set(teams?.byes ?? []);

const expected = await projections(contest.season, config.seasonType, config.week)
  .catch(() => ({}) as Record<string, StatLine>);
const worth = (player: { id: string; position: string }) =>
  projectedPoints(player.position as Position, expected[player.id], EASTSIDE);

const standIns = (await db.collection(`contests/${CONTEST}/entries`).get()).docs
  .filter((entry) => entry.id.startsWith(PREFIX))
  .sort((first, second) => first.id.localeCompare(second.id));

if (standIns.length === 0) throw new Error('No stand-ins. Run seed-testers.ts first.');

console.log(`${config.name}, NFL week ${config.week}. ${alive.size} clubs alive.\n`);

for (const [index, entry] of standIns.entries()) {
  const temperament = TEMPERAMENTS[index % TEMPERAMENTS.length]!;
  const teamName = (entry.data().teamName as string) ?? entry.id;

  if (temperament === 'absent') {
    console.log(`${teamName.padEnd(22)} ${temperament.padEnd(8)} submits nothing`);
    continue;
  }

  // What he held last round, and which of those are still in.
  const previous = round === 0
    ? []
    : (((await entry.ref.collection('rounds').doc(String(round - 1)).get()).data()?.players ?? []) as HeldPlayer[]);
  const survivors = previous.filter((held) => alive.has(byId.get(held.playerId)?.team ?? ''));
  const lost = previous.length - survivors.length;

  /** Who he keeps before filling anything: the heart of the difference between these managers. */
  let keeping: HeldPlayer[] =
    temperament === 'chaser' ? []
    : temperament === 'fiddler'
      // Drops his worst-projected survivor as well as the ones taken from him.
      ? [...survivors].sort((first, second) =>
          worth(byId.get(second.playerId)!) - worth(byId.get(first.playerId)!)).slice(0, -1)
      : survivors;

  const taken = new Set(keeping.map((held) => held.playerId));
  const available = pool
    .filter((player) => alive.has(player.team) && !taken.has(player.id))
    .sort((first, second) => worth(second) - worth(first));

  const players = EASTSIDE.slots.flatMap((slot): HeldPlayer[] => {
    const kept = keeping.find((held) => held.slot === slot.id);
    if (kept) return [{ ...kept, onBye: byes.has(byId.get(kept.playerId)?.team ?? '') }];
    const pick = available.find(
      (player) => slot.eligible.includes(player.position as Position) && !taken.has(player.id),
    );
    if (!pick) return [];
    taken.add(pick.id);
    return [{
      playerId: pick.id,
      position: pick.position as Position,
      slot: slot.id,
      onBye: byes.has(pick.team),
    }];
  });

  // What the streaks will read as, worked out the same way the app does.
  const history: HeldPlayer[][] = [];
  for (let past = 0; past < round; past += 1) {
    history.push(((await entry.ref.collection('rounds').doc(String(past)).get()).data()?.players ?? []) as HeldPlayer[]);
  }
  const standings = standingsFor([...history, players], round, EASTSIDE);
  const multipliers = standings.map((standing) => standing.multiplier);
  const top = Math.max(1, ...multipliers);
  const fresh = multipliers.filter((multiplier) => multiplier === 1).length;

  const changed = players.filter((held) => !previous.some((was) => was.playerId === held.playerId)).length;
  console.log(
    `${teamName.padEnd(22)} ${temperament.padEnd(8)} ` +
    `${String(changed).padStart(2)} new` +
    `${lost ? `, ${lost} knocked out` : ''}`.padEnd(18) +
    ` top ${top}x, ${fresh} at 1x`,
  );

  if (!dry) {
    await db.doc(`contests/${CONTEST}/entries/${entry.id}/rounds/${round}`).set({
      players,
      submittedAt: new Date(),
      stand_in: true,
    });
  }
}

console.log(dry ? '\nNothing written.' : `\nRound ${round} played for ${standIns.length} stand-ins.`);
