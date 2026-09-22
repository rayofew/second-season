import type { Position } from './rules.ts';

/**
 * A season, week by week.
 *
 * A season total says a receiver had 1,100 yards. It does not say whether that was fourteen quiet
 * afternoons and three enormous ones, which is the only thing a fantasy manager is actually asking:
 * a man who scores twelve every week and a man who scores nought four times and forty twice have
 * the same season and are completely different players to own.
 *
 * ESPN publishes the weeks as one flat row of figures per game, with a separate list naming the
 * columns. The names are the reliable part — the short labels repeat, with 'YDS' and 'TD' meaning
 * passing in one column and rushing six along — so columns are chosen by full name and given a
 * short heading here.
 */

export interface GameRow {
  week: number;
  /** 'at NYJ' or 'vs MIA', the way it is said. */
  against: string;
  /** 'W 30-10', or empty when ESPN has not filed one. */
  result: string;
  figures: string[];
}

export interface GameLog {
  labels: string[];
  games: GameRow[];
}

/** What to show, by full name, with the heading to show it under. */
const WANTED: Record<string, [name: string, label: string][]> = {
  QB: [
    ['Passing Yards', 'PASS'], ['Passing Touchdowns', 'TD'], ['Interceptions', 'INT'],
    ['Rushing Yards', 'RUSH'], ['Rushing Touchdowns', 'TD'],
  ],
  RB: [
    ['Rushing Attempts', 'CAR'], ['Rushing Yards', 'YDS'], ['Rushing Touchdowns', 'TD'],
    ['Receptions', 'REC'], ['Receiving Yards', 'YDS'], ['Receiving Touchdowns', 'TD'],
  ],
  WR: [
    ['Receptions', 'REC'], ['Receiving Targets', 'TGT'], ['Receiving Yards', 'YDS'],
    ['Receiving Touchdowns', 'TD'],
  ],
  K: [
    ['Field goals made', 'FG'], ['Field Goal Percentage', 'FG%'],
    ['Extra Points Made', 'XP'], ['Total Kicking Points', 'PTS'],
  ],
};
WANTED.TE = WANTED.WR!;

export interface RawLog {
  displayNames?: string[];
  events?: Record<string, {
    week?: number;
    atVs?: string;
    gameResult?: string;
    score?: string;
    opponent?: { abbreviation?: string };
  }>;
  seasonTypes?: {
    displayName?: string;
    categories?: { events?: { eventId: string; stats: string[] }[] }[];
  }[];
}

/**
 * The regular season only.
 *
 * ESPN files the postseason as its own block with its own weeks numbered from one, and two week
 * threes in the same table is worse than leaving out three games nobody was asking about.
 */
export function gameLog(raw: RawLog, position: Position): GameLog {
  const names = raw.displayNames ?? [];
  const columns = (WANTED[position] ?? WANTED.WR!)
    .map(([name, label]) => ({ label, at: names.indexOf(name) }))
    .filter((column) => column.at >= 0);
  if (columns.length === 0) return { labels: [], games: [] };

  const regular = (raw.seasonTypes ?? []).find((block) => /regular/i.test(block.displayName ?? ''))
    ?? raw.seasonTypes?.[0];

  const games = (regular?.categories ?? [])
    .flatMap((category) => category.events ?? [])
    .map((entry): GameRow | null => {
      const event = raw.events?.[entry.eventId];
      if (!event?.week) return null;
      const club = event.opponent?.abbreviation ?? '';
      return {
        week: event.week,
        against: club ? `${event.atVs === '@' ? 'at' : 'vs'} ${club}` : '',
        result: event.gameResult && event.score ? `${event.gameResult} ${event.score}` : '',
        figures: columns.map((column) => entry.stats[column.at] ?? '—'),
      };
    })
    .filter((row): row is GameRow => row !== null)
    .sort((first, second) => first.week - second.week);

  return { labels: columns.map((column) => column.label), games };
}
