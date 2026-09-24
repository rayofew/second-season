import { useEffect, useState } from 'react';
import { news } from '../domain/news.ts';
import type { RawNews, Story } from '../domain/news.ts';

/**
 * The league's recent writing, in one request, turned into a list per player.
 *
 * A hundred articles is about two days of it, which is the window in which anything said about a
 * player still changes a decision. Shared through one promise like the injuries, because every row
 * on screen wants the same answer and thirty of them asking is thirty requests for it.
 */

const FRESH = 10 * 60 * 1000;

let asked: Promise<Map<string, Story[]>> | null = null;
let askedAt = 0;

export function allNews(): Promise<Map<string, Story[]>> {
  if (asked && Date.now() - askedAt < FRESH) return asked;

  askedAt = Date.now();
  asked = fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=100', {
    signal: AbortSignal.timeout(8_000),
  })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((raw: RawNews) => news(raw))
    .catch(() => {
      // Down is not broken: nobody gets a marker, and the rest of the card is unaffected.
      asked = null;
      return new Map<string, Story[]>();
    });

  return asked;
}

export function useNews(): Map<string, Story[]> | null {
  const [all, setAll] = useState<Map<string, Story[]> | null>(null);

  useEffect(() => {
    let wanted = true;
    void allNews().then((found) => { if (wanted) setAll(found); });
    return () => { wanted = false; };
  }, []);

  return all;
}
