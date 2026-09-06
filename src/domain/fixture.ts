import type { ClubGame } from '../providers/schedule.ts';

/**
 * A fixture in as few characters as will still tell you what you need.
 *
 * Which day matters more than which date — nobody is choosing between two Sundays — and whether he
 * is home or away is one character. A club that is not playing says so rather than showing nothing,
 * because an empty cell reads like a bug.
 */
export function fixtureLabel(game: ClubGame | undefined): string {
  if (!game) return 'no game';
  const when = game.kickoff.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${when} ${game.home ? 'v' : 'at'} ${game.against}`;
}
