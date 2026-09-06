import type { ClubGame } from '../providers/schedule.ts';

/**
 * A fixture in as few characters as will still tell you what you need.
 *
 * Which day matters more than which date — nobody is choosing between two Sundays — and whether he
 * is home or away is one character. The minutes are kept because one o'clock and four o'clock games
 * are a real distinction, but the am and pm go: no NFL game kicks off at five in the morning.
 *
 * A club that is not playing says so rather than showing nothing, because an empty cell reads like
 * a fault.
 */
export function fixtureLabel(game: ClubGame | undefined): string {
  if (!game) return 'no game';
  const day = game.kickoff.toLocaleString(undefined, { weekday: 'short' });
  const time = game.kickoff
    .toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(/s?[AP]M/i, '');
  return `${day} ${time} ${game.home ? 'v' : 'at'} ${game.against}`;
}
