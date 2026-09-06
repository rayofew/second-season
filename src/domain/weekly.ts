/**
 * The weekly prize: whoever scored most in a round, before any multiplier.
 *
 * Deliberately raw rather than credited, so it is winnable by somebody having a bad contest. A
 * manager whose roster died in the first round is finished on the main prize by week two, and a
 * prize he cannot win is a prize that does not reach him.
 *
 * Ties are broken by walking down the roster: the better quarterback takes it; still tied, the
 * quarterback and the first running back together; and so on until somebody is ahead. Two managers
 * can only share it by having scored identically in every slot, which is a result worth sharing.
 */

export interface WeekEntry {
  entryId: string;
  /** Raw points, by slot id. */
  bySlot: Readonly<Record<string, number>>;
}

export interface WeekPlacing extends WeekEntry {
  raw: number;
  rank: number;
  /** The slot at which the tie broke, if one had to be broken. */
  decidedAt: string | null;
}

const total = (entry: WeekEntry) => Object.values(entry.bySlot).reduce((sum, points) => sum + points, 0);

/**
 * Positive when the second entry should place higher, so it can be handed straight to sort().
 * Also reports where a tie broke, which is the only part anybody will want explained.
 */
export function compareWeek(
  first: WeekEntry,
  second: WeekEntry,
  slotOrder: readonly string[],
): { order: number; at: string | null } {
  const gap = total(second) - total(first);
  if (Math.abs(gap) > 1e-9) return { order: gap, at: null };

  let running = 0;
  let theirs = 0;
  for (const slot of slotOrder) {
    running += first.bySlot[slot] ?? 0;
    theirs += second.bySlot[slot] ?? 0;
    if (Math.abs(running - theirs) > 1e-9) return { order: theirs - running, at: slot };
  }
  return { order: 0, at: null };
}

/** The week's table, best first. Entries nothing can separate share a rank. */
export function weekTable(entries: readonly WeekEntry[], slotOrder: readonly string[]): WeekPlacing[] {
  const ordered = [...entries].sort((first, second) => compareWeek(first, second, slotOrder).order);

  const placings: WeekPlacing[] = [];
  ordered.forEach((entry, index) => {
    const above = ordered[index - 1];
    const gap = above ? compareWeek(above, entry, slotOrder) : null;
    const tied = gap !== null && gap.order === 0;
    placings.push({
      ...entry,
      raw: total(entry),
      rank: tied ? placings[index - 1]!.rank : index + 1,
      decidedAt: gap && gap.order !== 0 ? gap.at : null,
    });
  });
  return placings;
}
