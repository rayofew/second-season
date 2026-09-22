/**
 * A message on the board, and who it can be sent to.
 *
 * The board itself is almost nothing — text, a name and a time. What needs care is the emailing,
 * because there is no server here to send anything. Firebase will do it from a Cloud Function or
 * the Trigger Email extension, both of which want the paid plan; until then the only machine that
 * can send mail on this league's behalf is the commissioner's own, through his own mail app.
 *
 * Which is not a bad answer. It comes from his address, so it arrives looking like a person rather
 * than a robot, and nobody has to trust a third party with fifteen email addresses.
 */

import { plain } from './markup.ts';

export interface Post {
  id: string;
  uid: string;
  /** Who wrote it, copied in at the time so a renamed manager does not rewrite history. */
  name: string;
  text: string;
  at: Date;
  /** Whether the writer asked for it to go out as email as well. */
  wantsEmail: boolean;
  /** When the commissioner actually sent it, if he has. */
  emailedAt?: Date;
}

/** Mail clients start dropping the rest of a mailto somewhere past two thousand characters. */
const ROOM = 1600;

/**
 * A mailto link that opens the commissioner's own mail app with the league in the blind copy.
 *
 * Blind, because a reply-all from fifteen people is how a mailing list dies, and because an address
 * somebody gave the commissioner was not given to the other fourteen.
 */
export function mailtoFor(post: Post, addresses: readonly string[], subject: string): string {
  // Asterisks in a mail client are just asterisks, so the marks come off on the way out.
  const said = plain(post.text);
  const body = said.length > ROOM
    ? `${said.slice(0, ROOM)}…\n\n(The rest is on the board.)`
    : said;

  const query = new URLSearchParams({
    bcc: [...new Set(addresses.filter(Boolean))].join(','),
    subject,
    body: `${body}\n\n— ${post.name}\n${'https://playoffs.spiteapps.app'}`,
  });

  // URLSearchParams encodes a space as '+', which a mail client shows as a literal plus.
  return `mailto:?${query.toString().replace(/\+/g, '%20')}`;
}

/** A subject line that says which league and roughly what, without being a whole sentence. */
export function subjectFor(post: Post, contestName: string): string {
  const firstLine = plain(post.text).split('\n')[0]?.trim() ?? '';
  const short = firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
  return short ? `${contestName}: ${short}` : contestName;
}
