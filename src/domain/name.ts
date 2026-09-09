/**
 * How a manager is named to the rest of the league.
 *
 * First name and last initial. Everybody knows who Dave K. is, and nobody has handed their full
 * name to a table their brother-in-law's coworker can also read — the same reasoning that keeps
 * phone numbers on the application rather than the entry.
 *
 * The surname is not shortened for display and then stored in full somewhere else: the entry only
 * ever holds the short form. What the commissioner needs in order to know who applied stays on the
 * application, which only he and the applicant can read.
 */

/** "Ray" + "Reznick" becomes "Ray R." — and anything missing simply drops out. */
export function shortName(first: string, last: string): string {
  const given = first.trim();
  const family = last.trim();
  if (!given) return family;
  const initial = [...family][0];
  return initial ? `${given} ${initial.toUpperCase()}.` : given;
}

/** Both halves as one line, for the commissioner deciding whether he knows this person. */
export const fullName = (first: string, last: string): string =>
  [first.trim(), last.trim()].filter(Boolean).join(' ');

/**
 * Splits a name that arrived as one string, which is how Google hands them over.
 *
 * Everything after the first word is the surname, so "Mary Anne Van Der Berg" keeps her surname
 * whole rather than being told her last name is Anne. A single word leaves the surname empty,
 * which the form then asks for.
 */
export function splitName(whole: string): { first: string; last: string } {
  const parts = whole.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  return { first: parts[0]!, last: parts.slice(1).join(' ') };
}
