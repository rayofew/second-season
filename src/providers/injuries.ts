import { useEffect, useState } from 'react';
import { injuries } from '../domain/injury.ts';
import type { Injuries, RawInjuries } from '../domain/injury.ts';

/**
 * Every injury in the league, in one request.
 *
 * ESPN publishes the lot on a single page — thirty-two clubs, every designation — which is one
 * fetch rather than a lookup per player, and cross-origin like the rest of them.
 *
 * Shared by everything on screen through one promise. A roster, a picker and a game-day list can
 * all be showing at once, and thirty rows each asking separately would be thirty requests for one
 * answer.
 *
 * Refetched every ten minutes at most. Designations move on a Friday afternoon and again about an
 * hour before kickoff, and no oftener.
 */

const FRESH = 10 * 60 * 1000;

let asked: Promise<Injuries> | null = null;
let askedAt = 0;

export function allInjuries(): Promise<Injuries> {
  if (asked && Date.now() - askedAt < FRESH) return asked;

  askedAt = Date.now();
  asked = fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries', {
    signal: AbortSignal.timeout(8_000),
  })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((raw: RawInjuries) => injuries(raw))
    .catch(() => {
      // A feed that is down should not make the app look broken; nobody gets a mark, that is all.
      asked = null;
      return { byEspnId: new Map(), byName: new Map() };
    });

  return asked;
}

/**
 * The same answer, as state, so a row redraws when it arrives.
 *
 * Null until it lands, which every caller treats as "no marks yet" rather than as a failure.
 */
export function useInjuries(): Injuries | null {
  const [found, setFound] = useState<Injuries | null>(null);

  useEffect(() => {
    let wanted = true;
    void allInjuries().then((all) => { if (wanted) setFound(all); });
    return () => { wanted = false; };
  }, []);

  return found;
}
