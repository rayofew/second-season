/**
 * A club that is resting scores nothing.
 *
 * That is the rule, and it is the one the rehearsal breaks. In January a club with a first-round
 * bye genuinely does not play, so there are no statistics for its players and every total comes out
 * right by accident. In the rehearsal the bracket's byes are invented over a real NFL week — Denver
 * and Seattle rest in our draw and play in the actual schedule — so the feeds hand back real
 * touchdowns for men who, by our rules, were not on the field at all.
 *
 * So the statistics are silenced rather than the totals patched. A resting club has no line this
 * week, which is what the scorer would see in January, and every screen that reads the line then
 * arrives at nought on its own without knowing anything about byes.
 *
 * Holding is untouched. The round still counts towards a multiplier — keeping a man through his
 * club's bye is exactly the patience the format is meant to reward, and it would be a strange
 * punishment to reset him for a week he could do nothing about.
 */

export function silence<T>(
  lines: Readonly<Record<string, T>>,
  clubOf: (playerId: string) => string | undefined,
  resting: ReadonlySet<string>,
): Record<string, T> {
  if (resting.size === 0) return { ...lines };

  const kept: Record<string, T> = {};
  for (const [playerId, line] of Object.entries(lines)) {
    const club = clubOf(playerId);
    // A player whose club we cannot identify keeps his line: guessing him out of the contest is a
    // worse failure than letting one through.
    if (club && resting.has(club)) continue;
    kept[playerId] = line;
  }
  return kept;
}
