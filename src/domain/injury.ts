/**
 * Who is hurt, and how badly.
 *
 * A projection of eighteen points for a man who is doubtful is not a projection, it is a trap —
 * and the feeds go on publishing one right up until he is ruled out on the Sunday morning. The
 * mark beside a name is the cheapest warning there is.
 *
 * Matched on ESPN's own athlete id wherever the pool has one, which is exact. The id is not given
 * directly: it is buried in the link to the player's page, which is the only place the injuries
 * feed puts it. Where there is no id, the name and club together are near enough — two clubs can
 * hold men of the same name, one club almost never does.
 */

export type Mark = 'Q' | 'D' | 'O' | 'IR' | 'PUP' | 'SUSP';

export interface Injury {
  /** The short form a fantasy screen shows: Q, D, O, IR. */
  mark: Mark;
  /** 'Questionable', 'Injured Reserve' — what the mark stands for. */
  status: string;
  /** 'Toe', 'Hamstring'. Empty when the feed does not say. */
  detail: string;
}

export interface Injuries {
  byEspnId: Map<string, Injury>;
  /** Keyed 'flattened name|CLUB', for the men whose ESPN id we never matched. */
  byName: Map<string, Injury>;
}

export interface RawInjuries {
  injuries?: {
    injuries?: {
      status?: string;
      type?: { abbreviation?: string; description?: string };
      details?: { type?: string };
      athlete?: {
        displayName?: string;
        team?: { abbreviation?: string };
        links?: { href?: string }[];
      };
    }[];
  }[];
}

/** Active is not an injury, whatever a feed files it under. */
const MARKS: Record<string, Mark> = {
  Q: 'Q', D: 'D', O: 'O', IR: 'IR', PUP: 'PUP', SUSP: 'SUSP',
};

/** Flattened the same way the id script does, so the two agree about who somebody is. */
export const flatten = (name: string): string => name
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
  .replace(/[^a-z ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** ESPN hides the athlete id in the URL of his page and nowhere else in this feed. */
const idFrom = (href: string | undefined): string | undefined =>
  /\/id\/(\d+)\//.exec(href ?? '')?.[1];

export function injuries(raw: RawInjuries): Injuries {
  const byEspnId = new Map<string, Injury>();
  const byName = new Map<string, Injury>();

  for (const team of raw.injuries ?? []) {
    for (const entry of team.injuries ?? []) {
      const mark = MARKS[(entry.type?.abbreviation ?? '').toUpperCase()];
      if (!mark) continue;

      const injury: Injury = {
        mark,
        status: entry.status ?? entry.type?.description ?? mark,
        detail: entry.details?.type ?? '',
      };

      const espnId = idFrom(entry.athlete?.links?.[0]?.href);
      if (espnId) byEspnId.set(espnId, injury);

      const name = entry.athlete?.displayName;
      const club = entry.athlete?.team?.abbreviation;
      if (name && club) byName.set(`${flatten(name)}|${club}`, injury);
    }
  }

  return { byEspnId, byName };
}

/** What to show beside one player, by whichever key we can match him on. */
export function injuryOf(
  found: Injuries | null,
  player: { espnId?: string; name: string; team: string },
): Injury | undefined {
  if (!found) return undefined;
  return (player.espnId ? found.byEspnId.get(player.espnId) : undefined)
    ?? found.byName.get(`${flatten(player.name)}|${player.team}`);
}

/** How much notice to take: out and reserve are facts, questionable is a coin toss. */
export const gravity = (mark: Mark): 'gone' | 'doubt' | 'maybe' =>
  mark === 'O' || mark === 'IR' || mark === 'PUP' || mark === 'SUSP' ? 'gone'
  : mark === 'D' ? 'doubt'
  : 'maybe';
