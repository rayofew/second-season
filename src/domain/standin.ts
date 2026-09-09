import { EASTSIDE } from './rules.ts';
import type { Position, Slot } from './rules.ts';
import type { HeldPlayer } from './multiplier.ts';

/**
 * Managers who do not exist, so the league can be tested before it has people in it.
 *
 * Not accounts. Nobody can sign in as one and none of this touches Firebase Auth — they are
 * entries and rosters, which is what the standings, the live board, the pot and a Monday advance
 * actually read. What needs testing is the game, not the login.
 *
 * They are given temperaments rather than random teams, because random picks would prove almost
 * nothing. The whole game is the multiplier, and a multiplier only means something when managers
 * treat it differently — one who never lets go against one who chases the best projection every
 * week is the entire thesis of the format, played out where it can be watched.
 */

/** Only for sweeping up stand-ins made before the register existed, whose ids said what they were. */
export const STAND_IN_PREFIX = 'stand-in-';

/**
 * An id indistinguishable from one Firebase would have issued.
 *
 * A stand-in used to be stand-in-3, which is the document id and is handed to every member who
 * reads the league. No field on the entry gives them away any more, so neither may this.
 */
export function newUid(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(28);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

export type Temperament = 'loyal' | 'chaser' | 'patcher' | 'fiddler' | 'absent';

export interface StandIn {
  name: string;
  teamName: string;
  temperament: Temperament;
}

/**
 * Ordinary names, so the league reads as a league.
 *
 * They were called Stand-in One through Ten, which made every screen look like a test harness —
 * fine for checking a layout, useless for seeing what the table will feel like with ten people in
 * it, and no encouragement at all to somebody deciding whether to join.
 *
 * Which entries are invented is recorded in the commissioner's own document, never on the entry,
 * because an entry is readable by every member. So he can always tell which of his managers are
 * real and nobody else can — which is the point, and worth being deliberate about: take them out
 * before the round that counts.
 */
export const STAND_INS: readonly StandIn[] = [
  { name: 'Dave Kessler', teamName: 'Sunday Scaries', temperament: 'loyal' },
  { name: 'Marcus Hale', teamName: 'Victory Formation', temperament: 'chaser' },
  { name: 'Tony Vitale', teamName: 'Third and Long', temperament: 'patcher' },
  { name: 'Ben Ortiz', teamName: 'The Pick Six', temperament: 'fiddler' },
  { name: 'Steve Rankin', teamName: 'Couch Potatoes', temperament: 'patcher' },
  { name: 'Nick Delgado', teamName: 'Hail Marys', temperament: 'absent' },
  { name: 'Pat Brennan', teamName: 'Pancake Blocks', temperament: 'loyal' },
  { name: 'Greg Lindstrom', teamName: 'Gridiron Grinders', temperament: 'chaser' },
  { name: 'Carl Okafor', teamName: 'Play Action Heroes', temperament: 'patcher' },
  { name: 'Mike Yost', teamName: 'Zero RB Club', temperament: 'fiddler' },
];

/** What each one is for, in a sentence, so a screen can say why the field looks like it does. */
export const WHY: Record<Temperament, string> = {
  loyal: 'never drops anybody still alive — climbs to 4x',
  chaser: 'takes the best projection every week — never leaves 1x',
  patcher: 'replaces only the men knocked out',
  fiddler: 'patches, and swaps his worst man each week',
  absent: 'submits nothing, so a forgotten roster gets tested',
};

export const uidFor = (index: number): string => `${STAND_IN_PREFIX}${index + 1}`;

/**
 * A number between 0 and 1 that is always the same for the same words.
 *
 * Deterministic on purpose: a field seeded twice is the same field, so a bug that only appears on
 * one particular roster can be got back rather than hunted for.
 */
function fraction(of: string): number {
  let hash = 2166136261;
  for (let index = 0; index < of.length; index += 1) {
    hash ^= of.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

/**
 * One manager's opinion of a player, which is not quite anybody else's.
 *
 * Without this every stand-in ranks the pool identically and picks the same nine, which in the
 * opening round — when nobody is holding anybody yet — means six managers with one team between
 * them. Real managers disagree about who is good, so each gets a fixed private view of every
 * player, up to a quarter either side of the projection.
 *
 * They still overlap heavily, which is correct: the pool is shared and half the league owning the
 * same running back is the situation the multiplier is supposed to sort out.
 */
export function tasteOf(
  seed: number,
  worth: (player: Candidate) => number,
): (player: Candidate) => number {
  return (player) => worth(player) * (0.75 + 0.5 * fraction(`${seed}:${player.id}`));
}

export interface Candidate {
  id: string;
  position: string;
  team: string;
}

/**
 * The nine this manager would pick, given what he held last round and what is still alive.
 *
 * Pure: it is handed the pool, the survivors and a way to value a player, and returns a legal
 * roster. Both the browser and the scripts run this same function, so a field seeded from a phone
 * on a Sunday is the same field the command line would have produced.
 */
export function pickFor(
  temperament: Temperament,
  previous: readonly HeldPlayer[],
  pool: readonly Candidate[],
  alive: ReadonlySet<string>,
  byes: ReadonlySet<string>,
  worth: (player: Candidate) => number,
  slots: readonly Slot[] = EASTSIDE.slots,
): HeldPlayer[] {
  if (temperament === 'absent') return [];

  const clubOf = new Map(pool.map((player) => [player.id, player.team]));
  const survivors = previous.filter((held) => alive.has(clubOf.get(held.playerId) ?? ''));
  const byIdInPool = new Map(pool.map((player) => [player.id, player]));

  const keeping =
    temperament === 'chaser' ? []
    : temperament === 'fiddler'
      // Lets go of his worst survivor as well as the men taken from him.
      ? [...survivors]
          .sort((first, second) => {
            const a = byIdInPool.get(first.playerId);
            const b = byIdInPool.get(second.playerId);
            return (b ? worth(b) : 0) - (a ? worth(a) : 0);
          })
          .slice(0, -1)
      : survivors;

  const taken = new Set(keeping.map((held) => held.playerId));
  const available = pool
    .filter((player) => alive.has(player.team) && !taken.has(player.id))
    .sort((first, second) => worth(second) - worth(first));

  return slots.flatMap((slot): HeldPlayer[] => {
    const kept = keeping.find((held) => held.slot === slot.id);
    if (kept) {
      return [{ ...kept, onBye: byes.has(clubOf.get(kept.playerId) ?? '') }];
    }
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
}
