import type { Field, Matchup } from './advance.ts';

/**
 * The bracket arranged as a tree, so it can be drawn with lines.
 *
 * Fourteen clubs come out as a clean binary tree: six Wild Card ties plus the two clubs resting is
 * eight slots, then four, then two, then one. Every slot in a round is fed by exactly two slots in
 * the round before it, which is the only thing a drawn bracket needs to be true.
 *
 * What is not automatic is the order. The rounds are reseeded — best surviving seed against worst —
 * so the club that comes out of the top Wild Card tie does not necessarily play the club out of the
 * second one. Drawing a fixed tree and hoping would put lines on the screen that lie.
 *
 * So the order is worked out backwards from whatever has actually been drawn. Each round is sorted
 * to put the two slots that feed a given slot next to each other, directly above and below it,
 * which is what makes the lines both straight and honest. Rounds nobody has reached yet cannot be
 * ordered by anything, so they are seeded slots waiting to be filled.
 */

export type SlotKind = 'tie' | 'bye' | 'empty';

export interface Slot {
  kind: SlotKind;
  /** Both clubs for a tie; the resting club sits in `home` alone for a bye. Empty for neither. */
  home: string;
  away: string;
  winner: string | null;
  /** Which club leaves this slot for the next round. Empty until it is known. */
  through: string;
  conference: string;
}

export interface Column {
  round: number;
  slots: Slot[];
}

/** What a round looks like in the store: who is drawn against whom, and who is resting. */
export interface RoundDraw {
  matchups: readonly Matchup[];
  byes?: readonly string[];
}

const EMPTY: Slot = { kind: 'empty', home: '', away: '', winner: null, through: '', conference: '' };

const seedOf = (field: Field, club: string) => field[club]?.seed ?? 99;
const conferenceOf = (field: Field, club: string) => field[club]?.conference ?? '';

/** The best seed in a slot, which is what a bracket sorts its opening round by. */
const topSeed = (field: Field, slot: Slot) =>
  slot.kind === 'empty' ? 99 : Math.min(seedOf(field, slot.home), slot.away ? seedOf(field, slot.away) : 99);

const CONFERENCES = ['AFC', 'NFC'];

function slotsOf(draw: RoundDraw, field: Field): Slot[] {
  const ties: Slot[] = draw.matchups.map((matchup) => ({
    kind: 'tie',
    home: matchup.home,
    away: matchup.away,
    winner: matchup.winner ?? null,
    through: matchup.winner ?? '',
    conference: conferenceOf(field, matchup.home),
  }));
  // A club resting takes a slot of its own: it is in the next round whatever anybody else does.
  const byes: Slot[] = (draw.byes ?? []).map((club) => ({
    kind: 'bye',
    home: club,
    away: '',
    winner: club,
    through: club,
    conference: conferenceOf(field, club),
  }));
  return [...ties, ...byes];
}

/** AFC above NFC, and the best seed at the top of each — how a bracket is drawn before it starts. */
function bySeed(slots: Slot[], field: Field): Slot[] {
  return [...slots].sort((first, second) => {
    const conference = CONFERENCES.indexOf(first.conference) - CONFERENCES.indexOf(second.conference);
    return conference !== 0 ? conference : topSeed(field, first) - topSeed(field, second);
  });
}

/**
 * Put the two slots that feed each slot of the round after it directly above and below it.
 *
 * Anything that fed nothing — which cannot normally happen, but a half-entered round in the store
 * would do it — keeps its seeded order at the bottom rather than disappearing off the screen.
 */
function byFeed(slots: Slot[], next: Slot[], field: Field): Slot[] {
  const placed = new Map<number, Slot[]>();
  const orphans: Slot[] = [];

  for (const slot of bySeed(slots, field)) {
    const index = next.findIndex(
      (after) => after.kind !== 'empty' && (after.home === slot.through || after.away === slot.through),
    );
    if (index === -1 || !slot.through) orphans.push(slot);
    else placed.set(index, [...(placed.get(index) ?? []), slot]);
  }

  const ordered: Slot[] = [];
  for (let index = 0; index < next.length; index += 1) {
    const pair = placed.get(index) ?? [];
    // Better seed on top, which is the convention and keeps a redrawn round looking the same way up.
    ordered.push(...pair.sort((first, second) => topSeed(field, first) - topSeed(field, second)));
  }
  return [...ordered, ...orphans];
}

/** Pad a round out to the width the tree needs, so the lines have something to point at. */
const padded = (slots: Slot[], width: number): Slot[] =>
  slots.length >= width ? slots : [...slots, ...Array.from({ length: width - slots.length }, () => ({ ...EMPTY }))];

export function tree(draws: readonly (RoundDraw | null)[], field: Field): Column[] {
  const count = draws.length;
  if (count === 0) return [];

  // One slot in the final, doubling backwards. Nothing here depends on there being four rounds.
  const widths = Array.from({ length: count }, (_, round) => 2 ** (count - 1 - round));

  const columns: Column[] = Array.from({ length: count }, (_, round) => ({ round, slots: [] }));

  // Backwards, because a round can only be ordered against the round it feeds.
  let next: Slot[] | null = null;
  for (let round = count - 1; round >= 0; round -= 1) {
    const draw = draws[round];
    const raw = draw ? slotsOf(draw, field) : [];
    const ordered = next && raw.length > 0 ? byFeed(raw, next, field) : bySeed(raw, field);
    const slots = padded(ordered, widths[round]!);
    columns[round]!.slots = slots;
    // Only a round that has actually been drawn can order the one before it.
    if (raw.length > 0) next = slots;
  }

  return columns;
}
