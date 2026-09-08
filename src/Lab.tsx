import { useEffect, useMemo, useState } from 'react';
import { EASTSIDE } from './domain/rules.ts';
import type { Position } from './domain/rules.ts';
import { liveRoster } from './domain/live.ts';
import type { LiveInput } from './domain/live.ts';
import { points, projectedPoints, rawPoints } from './domain/scoring.ts';
import type { StatLine } from './domain/scoring.ts';
import { projections, stats } from './providers/sleeper.ts';
import { clubGames } from './providers/schedule.ts';
import type { ClubGame } from './providers/schedule.ts';
import { readPool } from './store/firestore.ts';
import type { PoolPlayer } from './store/firestore.ts';
import { GameDay } from './GameDay.tsx';
import { useHeartbeat } from './useHeartbeat.ts';

/**
 * A game-day screen pointed at football that is actually being played, for working on the layout.
 *
 * The contest does not start until week two, so the real screen cannot be seen until the first lock
 * — by which time it is being looked at by ten people during a round that counts. That is a poor
 * moment to discover the scoreline wraps on a phone.
 *
 * So: any week, any two clubs, a plausible nine built out of them, and the same GameDay component
 * the real screen uses. Live scores, live stats, live clock. It reads the player pool and nothing
 * else, and it writes nothing anywhere — there is no way for anything here to reach the contest.
 */

const CONTEST = 'rehearsal-2026';
const HEARTBEAT = 45_000;

/** A spread rather than all 1x, so every badge style is on screen the moment it loads. */
const SPREAD = [1, 2, 3, 4, 1, 2, 3, 4, 1];

export function Lab() {
  const [pool, setPool] = useState<PoolPlayer[]>([]);
  const [week, setWeek] = useState(1);
  const [home, setHome] = useState('SEA');
  const [away, setAway] = useState('NE');
  const [offset, setOffset] = useState(0);
  const [games, setGames] = useState<Map<string, ClubGame>>(new Map());
  const [actual, setActual] = useState<Record<string, StatLine>>({});
  const [expected, setExpected] = useState<Record<string, StatLine>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void readPool(CONTEST).then(setPool).catch(() => setPool([]));
  }, []);

  const stillGoing = [...games.values()].some((game) => game.state !== 'final');
  const beat = useHeartbeat(stillGoing, HEARTBEAT);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [clubs, live, guess] = await Promise.all([
        clubGames(2026, week).catch(() => new Map<string, ClubGame>()),
        stats(2026, 'regular', week).catch(() => ({}) as Record<string, StatLine>),
        projections(2026, 'regular', week).catch(() => ({}) as Record<string, StatLine>),
      ]);
      if (cancelled) return;
      setGames(clubs);
      setActual(live);
      setExpected(guess);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [week, beat]);

  /** Every club the pool actually knows about, which is the fourteen in the bracket. */
  const clubs = useMemo(
    () => [...new Set(pool.map((player) => player.team))].filter(Boolean).sort(),
    [pool],
  );

  const byId = useMemo(() => new Map(pool.map((player) => [player.id, player])), [pool]);

  /**
   * A believable nine drawn from the two clubs, best projection first.
   *
   * Falls back to the whole pool for any slot the two clubs cannot fill, because a kicker missing
   * from the feed should not leave a hole in the layout being worked on.
   */
  const roster = useMemo((): LiveInput[] => {
    if (pool.length === 0) return [];
    const featured = pool.filter((player) => player.team === home || player.team === away);
    const worth = (player: PoolPlayer) =>
      projectedPoints(player.position as Position, expected[player.id], EASTSIDE);
    const rank = (list: PoolPlayer[]) => [...list].sort((first, second) => worth(second) - worth(first));

    const taken = new Set<string>();
    const built: LiveInput[] = [];
    EASTSIDE.slots.forEach((slot, index) => {
      const fits = (player: PoolPlayer) =>
        slot.eligible.includes(player.position as Position) && !taken.has(player.id);
      const pick = rank(featured).find(fits) ?? rank(pool).find(fits);
      if (!pick) return;
      taken.add(pick.id);
      const state = games.get(pick.team)?.state ?? 'upcoming';
      built.push({
        playerId: pick.id,
        slot: slot.id,
        multiplier: SPREAD[(index + offset) % SPREAD.length]!,
        raw: rawPoints(pick.position as Position, actual[pick.id], EASTSIDE),
        projected: projectedPoints(pick.position as Position, expected[pick.id], EASTSIDE),
        state,
        line: state === 'upcoming' ? expected[pick.id] : actual[pick.id],
      });
    });
    return built;
  }, [pool, home, away, actual, expected, games, offset]);

  const live = liveRoster(roster);
  const fixture = games.get(home);

  return (
    <>
      <div className="card notice">
        <strong>Nothing here counts.</strong> This is the game-day layout pointed at real football so
        it can be worked on before it matters. It reads the player pool and the public feeds, and it
        writes nothing — no roster, no score, no round. The nine below are made up.
      </div>

      <div className="card editor">
        <div className="splitrow">
          <label>
            <span className="reasonlabel">NFL week</span>
            <input
              type="number"
              min={1}
              max={18}
              value={week}
              onChange={(event) => setWeek(Math.min(18, Math.max(1, Number(event.target.value) || 1)))}
            />
          </label>
          <label>
            <span className="reasonlabel">Away</span>
            <select value={away} onChange={(event) => setAway(event.target.value)}>
              {clubs.map((club) => <option key={club} value={club}>{club}</option>)}
            </select>
          </label>
          <label>
            <span className="reasonlabel">Home</span>
            <select value={home} onChange={(event) => setHome(event.target.value)}>
              {clubs.map((club) => <option key={club} value={club}>{club}</option>)}
            </select>
          </label>
        </div>
        <div className="inline">
          <button className="ghost small" onClick={() => setOffset((current) => current + 1)}>
            Shift the multipliers
          </button>
          <span>
            {loading ? 'Fetching…'
              : fixture
                ? `${away} at ${home} · ${fixture.state}${fixture.clock ? ` · ${fixture.clock}` : ''}`
                : 'No fixture for that club this week'}
            {stillGoing && ' · refreshing every 45s'}
          </span>
        </div>
      </div>

      <div className="card countdown shut">
        <div className="cdround"><strong>Layout rehearsal</strong><span className="team"> · NFL week {week}</span></div>
        <div className="cdwhen">{points(live.running)}</div>
        <div className="cdstate">
          {points(live.banked)} banked
          {live.playing > 0 && ` · ${live.playing} playing now`}
          {live.yetToPlay > 0 && ` · ${live.yetToPlay} yet to kick off, carried at projection`}
        </div>
      </div>

      {roster.length === 0 ? (
        <div className="card gate"><p>{loading ? 'Loading…' : 'The player pool is empty, so there is nobody to lay out.'}</p></div>
      ) : (
        <GameDay
          live={live}
          pool={byId}
          games={games}
          onGoToTeam={() => undefined}
        />
      )}
    </>
  );
}
