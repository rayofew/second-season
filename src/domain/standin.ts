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

export const STAND_IN_PREFIX = 'stand-in-';

export type Temperament = 'loyal' | 'chaser' | 'patcher' | 'fiddler' | 'absent';

export interface StandIn {
  name: string;
  teamName: string;
  temperament: Temperament;
}

/** Deliberately obvious. Nobody should ever wonder whether one of these is somebody's cousin. */
export const STAND_INS: readonly StandIn[] = [
  { name: 'Stand-in One', teamName: 'Dry Run FC', temperament: 'loyal' },
  { name: 'Stand-in Two', teamName: 'Placeholder United', temperament: 'chaser' },
  { name: 'Stand-in Three', teamName: 'The Rehearsals', temperament: 'patcher' },
  { name: 'Stand-in Four', teamName: 'Test Pattern', temperament: 'fiddler' },
  { name: 'Stand-in Five', teamName: 'Nobody Athletic', temperament: 'patcher' },
  { name: 'Stand-in Six', teamName: 'Empty Chair XI', temperament: 'absent' },
  { name: 'Stand-in Seven', teamName: 'Understudy FC', temperament: 'loyal' },
  { name: 'Stand-in Eight', teamName: 'Soundcheck Rovers', temperament: 'chaser' },
  { name: 'Stand-in Nine', teamName: 'Fire Drill City', temperament: 'patcher' },
  { name: 'Stand-in Ten', teamName: 'Sandbox Wanderers', temperament: 'fiddler' },
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
