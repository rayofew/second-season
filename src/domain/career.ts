import type { Position } from './rules.ts';

/**
 * What a player has actually done, season by season.
 *
 * The card used to answer "what is he worth this week" and nothing else, which is only half the
 * question anybody asks before picking somebody. The other half is whether he has ever been any
 * good, and that is not a projection — it is four rows of his last four years.
 *
 * ESPN publishes it a dozen columns wide. Twelve columns is a spreadsheet on a desk and unreadable
 * on a phone, so each category is cut to the handful that decide a fantasy afternoon and shown in
 * the order the sport talks about them. A quarterback's yards, touchdowns and interceptions. A
 * receiver's catches, yards and touchdowns. Nothing about long gains or first downs, which are
 * interesting and have never once settled a league.
 */

export interface RawCategory {
  name: string;
  labels: string[];
  statistics: { season?: { year?: number }; teamSlug?: string; stats: string[] }[];
}

export interface SeasonRow {
  year: number;
  team: string;
  /** In the order of the table's own labels. */
  figures: string[];
}

export interface CareerTable {
  /** 'Passing', 'Rushing', 'Receiving', 'Kicking' — as somebody would say it. */
  name: string;
  labels: string[];
  seasons: SeasonRow[];
}

/** The columns worth the width, per category. */
const WANTED: Record<string, string[]> = {
  passing: ['GP', 'YDS', 'TD', 'INT'],
  rushing: ['GP', 'CAR', 'YDS', 'TD'],
  receiving: ['GP', 'REC', 'YDS', 'TD'],
  kicking: ['GP', 'FG', 'FG%', 'XPM', 'PTS'],
};

/** Which categories matter for whom, best first. A quarterback runs; a kicker does not catch. */
const FOR: Record<string, string[]> = {
  QB: ['passing', 'rushing'],
  RB: ['rushing', 'receiving'],
  WR: ['receiving', 'rushing'],
  TE: ['receiving'],
  K: ['kicking'],
  DEF: [],
};

const TITLE: Record<string, string> = {
  passing: 'Passing', rushing: 'Rushing', receiving: 'Receiving', kicking: 'Kicking',
};

/** ESPN writes a club as 'buffalo-bills'. Nobody says that. */
const clubOf = (slug: string | undefined): string =>
  (slug ?? '').split('-').slice(-1)[0]?.replace(/^./, (first) => first.toUpperCase()) ?? '';

/**
 * The seasons worth showing, newest first.
 *
 * Four, which covers a rookie contract and is as far back as anybody argues about. A category he
 * has no figures in at all is left out rather than shown as a column of noughts — a receiver with
 * an empty passing table is a row of zeroes pretending to be information.
 */
export function career(
  categories: readonly RawCategory[],
  position: Position,
  seasons = 4,
): CareerTable[] {
  const wanted = FOR[position] ?? ['receiving', 'rushing'];

  return wanted.flatMap((name): CareerTable[] => {
    const found = categories.find((category) => category.name === name);
    if (!found) return [];

    const columns = (WANTED[name] ?? found.labels)
      .map((label) => ({ label, at: found.labels.indexOf(label) }))
      .filter((column) => column.at >= 0);
    if (columns.length === 0) return [];

    const rows = [...found.statistics]
      .filter((entry) => entry.season?.year)
      .sort((first, second) => (second.season!.year ?? 0) - (first.season!.year ?? 0))
      .slice(0, seasons)
      .map((entry): SeasonRow => ({
        year: entry.season!.year!,
        team: clubOf(entry.teamSlug),
        figures: columns.map((column) => entry.stats[column.at] ?? '—'),
      }));

    // Every figure nought means he has never done this, whatever ESPN files him under.
    const didSomething = rows.some((row) =>
      row.figures.some((figure) => figure !== '0' && figure !== '0.0' && figure !== '0-0'));
    if (rows.length === 0 || !didSomething) return [];

    return [{ name: TITLE[name] ?? name, labels: columns.map((column) => column.label), seasons: rows }];
  });
}
