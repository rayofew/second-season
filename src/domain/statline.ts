import type { StatLine } from './scoring.ts';
import type { Position } from './rules.ts';

/**
 * A stat line in the words a box score uses.
 *
 * "17.8" tells you what a man was worth and nothing about what he did. "4/8 Rec 78 Yd 1 TD" tells
 * you he was quiet until the touchdown, and it is the line every one of these managers has been
 * reading on Fleaflicker for years — so it is phrased their way rather than invented afresh.
 *
 * Empty categories are left out entirely. A receiver who did not carry the ball should not be told
 * he ran for none; a row that lists every zero is a row nobody reads.
 */

/**
 * A field as a box score would print it: whole, and zero when there is nothing to say.
 *
 * Rounding has to happen before anything decides whether a category is worth mentioning. A
 * projected 0.4 rushing touchdowns is a truthy number that rounds to nothing, so testing the raw
 * value put "0 TD" on the end of every row the feed produced.
 */
const round = (line: StatLine, field: string): number => Math.round(line[field] ?? 0);

function passing(line: StatLine): string[] {
  const parts: string[] = [];
  const yards = round(line, 'pass_yd');
  if (yards || round(line, 'pass_att')) parts.push(`${yards} Yd`);
  const scores = round(line, 'pass_td');
  if (scores) parts.push(`${scores} TD`);
  const picks = round(line, 'pass_int');
  if (picks) parts.push(`${picks} INT`);
  return parts;
}

/** Labelled for a quarterback, bare for a running back, because only one of them is ambiguous. */
function rushing(line: StatLine, label: boolean): string[] {
  const parts: string[] = [];
  const yards = round(line, 'rush_yd');
  if (yards || round(line, 'rush_att')) parts.push(label ? `${yards} Rush Yd` : `${yards} Yd`);
  const scores = round(line, 'rush_td');
  if (scores) parts.push(`${scores} TD`);
  return parts;
}

function receiving(line: StatLine): string[] {
  const parts: string[] = [];
  const catches = round(line, 'rec');
  const targets = round(line, 'rec_tgt');
  const yards = round(line, 'rec_yd');
  if (catches || targets) {
    parts.push(targets ? `${catches}/${targets} Rec` : `${catches} Rec`);
    parts.push(`${yards} Yd`);
  } else if (yards) {
    parts.push(`${yards} Yd`);
  }
  const scores = round(line, 'rec_td');
  if (scores) parts.push(`${scores} TD`);
  return parts;
}

function kicking(line: StatLine): string[] {
  const parts: string[] = [];
  const made = round(line, 'fgm');
  const tried = round(line, 'fga');
  if (made || tried) parts.push(tried ? `${made}/${tried} FG` : `${made} FG`);
  const extras = round(line, 'xpm');
  const extrasTried = round(line, 'xpa');
  if (extras || extrasTried) parts.push(extrasTried ? `${extras}/${extrasTried} XP` : `${extras} XP`);
  return parts;
}

function defense(line: StatLine): string[] {
  const parts: string[] = [];
  const add = (field: string, word: string) => {
    const count = round(line, field);
    if (count) parts.push(`${count} ${word}`);
  };
  add('sack', 'Sack');
  add('int', 'INT');
  add('fum_rec', 'FR');
  add('def_td', 'TD');
  add('safe', 'Safety');
  add('blk_kick', 'BLK');
  // Points allowed is the one figure that means something at zero, so it is never dropped.
  if ('pts_allow' in line) parts.push(`${round(line, 'pts_allow')} PA`);
  return parts;
}

/**
 * What a player did, for the position he is being scored at.
 *
 * Returns an empty string for a man who has done nothing at all, which the caller should read as
 * "no line yet" rather than "a bad game" — before kickoff the two look identical from here, and the
 * fixture beside him is what tells them apart.
 */
export function statLine(position: Position, line: StatLine | undefined): string {
  if (!line) return '';
  const parts =
    position === 'QB' ? [...passing(line), ...rushing(line, true), ...receiving(line)]
    : position === 'K' ? kicking(line)
    : position === 'DEF' ? defense(line)
    : position === 'RB' ? [...rushing(line, false), ...receiving(line)]
    : [...receiving(line), ...rushing(line, true)];

  const fumbles = round(line, 'fum_lost');
  if (fumbles && position !== 'DEF') parts.push(`${fumbles} FUM`);
  return parts.join(' ');
}
