/**
 * What has been written about a player lately.
 *
 * A designation says he is questionable. It does not say his coach called him a game-time
 * decision on Friday, or that the man behind him took every first-team rep on Thursday — and that
 * is the difference between starting him and not.
 *
 * ESPN has no per-player news feed: asking for one returns nothing at all. What it does have is a
 * league feed in which most articles are tagged with the athletes they are about, so the whole
 * thing is fetched once and turned inside out into a list per player.
 */

export interface Story {
  headline: string;
  summary: string;
  at: Date;
  href: string;
}

export interface RawNews {
  articles?: {
    headline?: string;
    description?: string;
    published?: string;
    links?: { web?: { href?: string } };
    categories?: { type?: string; athleteId?: number | string }[];
  }[];
}

/** Four is a scan; ten is a reading list, and nobody opens a card to do homework. */
const KEEP = 4;

export function news(raw: RawNews): Map<string, Story[]> {
  const byAthlete = new Map<string, Story[]>();

  const sorted = [...(raw.articles ?? [])]
    .map((article) => ({
      article,
      at: article.published ? new Date(article.published) : new Date(0),
    }))
    .sort((first, second) => second.at.getTime() - first.at.getTime());

  for (const { article, at } of sorted) {
    const headline = article.headline?.trim();
    if (!headline) continue;

    const story: Story = {
      headline,
      summary: article.description?.trim() ?? '',
      at,
      href: article.links?.web?.href ?? '',
    };

    for (const category of article.categories ?? []) {
      if (category.type !== 'athlete' || category.athleteId === undefined) continue;
      const id = String(category.athleteId);
      const already = byAthlete.get(id) ?? [];
      // Newest first by construction, and the same article can be tagged twice.
      if (already.length >= KEEP || already.some((told) => told.headline === headline)) continue;
      byAthlete.set(id, [...already, story]);
    }
  }

  return byAthlete;
}

/** His stories, or none. Only ever matched on ESPN's own id — a name is not evidence enough here. */
export function storiesFor(
  all: Map<string, Story[]> | null,
  espnId: string | undefined,
): Story[] {
  return (espnId && all?.get(espnId)) || [];
}
