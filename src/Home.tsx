import { useEffect, useState } from 'react';
import { EASTSIDE } from './domain/rules.ts';
import { standingsFor } from './domain/multiplier.ts';
import type { HeldPlayer } from './domain/multiplier.ts';
import { readContest, readEntries, readHistory, readPool, readTeams } from './store/firestore.ts';
import type { Contest, Manager, PoolPlayer, RoundTeams } from './store/firestore.ts';
import { PlayerRow } from './PlayerRow.tsx';
import { liveRoster } from './domain/live.ts';
import type { LiveTotal } from './domain/live.ts';
import { points, projectedPoints, rawPoints } from './domain/scoring.ts';
import type { StatLine } from './domain/scoring.ts';
import { projections, stats } from './providers/sleeper.ts';
import { clubGames } from './providers/schedule.ts';
import type { ClubGame } from './providers/schedule.ts';
import { fixtureLabel } from './domain/fixture.ts';
import { Pool } from './Pool.tsx';
import { Countdown } from './Countdown.tsx';
import { GameDay } from './GameDay.tsx';
import { useHeartbeat } from './useHeartbeat.ts';

/**
 * The screen somebody opens on a Sunday, in the order they need it.
 *
 * How long until picks lock comes first, because it is the only thing here that can still be acted
 * on. Then whether they have actually submitted — a manager who thinks he is in and is not is the
 * worst failure this app has — then the football itself.
 *
 * Once the round locks this stops being a summary and becomes the game-day screen: the fixtures
 * that are actually happening, with your men hung off them. Where everybody else stands is the
 * Standings tab's job, and duplicating it here is what made Home and My Team feel like one screen
 * printed twice.
 */

const CONTEST = 'rehearsal-2026';

/**
 * How often the live numbers are asked for again.
 *
 * Forty-five seconds is faster than anybody can read a nine-man roster and slower than a drive.
 * Only the free public feeds are refetched on it — see the second effect for why.
 */
const HEARTBEAT = 45_000;

export function Home({ uid, onGoToTeam }: { uid: string; onGoToTeam: () => void }) {
  const [contest, setContest] = useState<Contest | null>(null);
  const [teams, setTeams] = useState<RoundTeams | null>(null);
  const [pool, setPool] = useState<Map<string, PoolPlayer>>(new Map());
  const [roster, setRoster] = useState<HeldPlayer[]>([]);
  const [history, setHistory] = useState<HeldPlayer[][]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [now, setNow] = useState(new Date());
  const [live, setLive] = useState<LiveTotal | null>(null);
  const [projectedTotal, setProjectedTotal] = useState<number | null>(null);
  const [games, setGames] = useState<Map<string, ClubGame>>(new Map());

  useEffect(() => {
    // The countdown is the point of the screen before a lock, so it has to actually count.
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Everything that cannot change while a round is being played, fetched once.
  useEffect(() => {
    void (async () => {
      const found = await readContest(CONTEST).catch(() => null);
      if (!found) return;
      setContest(found);
      const round = found.currentRound;
      const [roundTeams, board, past, people] = await Promise.all([
        readTeams(CONTEST, round).catch(() => null),
        readPool(CONTEST).catch(() => []),
        readHistory(CONTEST, uid, round).catch(() => []),
        readEntries(CONTEST).catch(() => []),
      ]);
      setTeams(roundTeams);
      setPool(new Map(board.map((player) => [player.id, player])));
      setHistory(past);
      setManagers(people);
      setRoster(past[round] ?? []);
    })();
  }, [uid]);

  const roundNow = contest?.currentRound ?? 0;
  const lockAt = contest?.locks[String(roundNow)];
  const shut = lockAt ? lockAt <= now : false;
  // Nothing to refresh on a Tuesday, and nothing to refresh once every game has finished.
  const stillGoing = [...games.values()].some((game) => game.state !== 'final');
  const beat = useHeartbeat(shut && stillGoing, HEARTBEAT);

  /**
   * The live half, asked for again on every heartbeat.
   *
   * Kept apart from the load above on purpose. Sleeper and ESPN are free and public; Firestore reads
   * are metered, and refetching a roster that cannot change every forty-five seconds for six hours
   * would spend the free tier on an answer we already have.
   */
  useEffect(() => {
    if (!contest || roster.length === 0) return;
    const config = contest.rounds[roundNow];
    if (!config) return;
    let cancelled = false;

    void (async () => {
      const standingNow = new Map(
        standingsFor([...history.slice(0, roundNow), roster], roundNow, EASTSIDE)
          .map((entry) => [entry.slot, entry]),
      );
      const [clubs, expected] = await Promise.all([
        clubGames(contest.season, config.week).catch(() => new Map<string, ClubGame>()),
        projections(contest.season, config.seasonType, config.week)
          .catch(() => ({}) as Record<string, StatLine>),
      ]);
      if (cancelled) return;
      setGames(clubs);

      // Before the lock there is nothing to watch, but there is something to expect.
      const shutNow = (contest.locks[String(roundNow)] ?? new Date()) <= new Date();
      if (!shutNow) {
        setProjectedTotal(roster.reduce((sum, held) => {
          const expect = projectedPoints(held.position, expected[held.playerId], EASTSIDE);
          return sum + expect * (standingNow.get(held.slot)?.multiplier ?? 1);
        }, 0));
        return;
      }

      const actual = await stats(contest.season, config.seasonType, config.week)
        .catch(() => ({}) as Record<string, StatLine>);
      if (cancelled) return;
      setLive(liveRoster(roster.map((held) => {
        const person = pool.get(held.playerId);
        return {
          playerId: held.playerId,
          slot: held.slot,
          multiplier: standingNow.get(held.slot)?.multiplier ?? 1,
          raw: rawPoints(held.position, actual[held.playerId], EASTSIDE),
          projected: projectedPoints(held.position, expected[held.playerId], EASTSIDE),
          state: person ? (clubs.get(person.team)?.state ?? 'upcoming') : 'final',
        };
      })));
    })();

    return () => { cancelled = true; };
  }, [contest, roster, history, pool, roundNow, beat]);

  if (!contest) return <div className="card gate"><p>Loading…</p></div>;

  const round = contest.rounds[contest.currentRound];
  const lock = contest.locks[String(contest.currentRound)];
  const locked = lock ? lock <= now : false;
  const submitted = roster.length === EASTSIDE.slots.length;
  const standings = new Map(
    standingsFor([...history.slice(0, contest.currentRound), roster], contest.currentRound, EASTSIDE)
      .map((entry) => [entry.slot, entry]),
  );
  const counts = [4, 3, 2, 1]
    .map((level) => ({ level, count: [...standings.values()].filter((entry) => entry.multiplier === level).length }))
    .filter((entry) => entry.count > 0);
  const alive = new Set(teams?.alive ?? []);
  const gone = roster.filter((held) => !alive.has(pool.get(held.playerId)?.team ?? ''));

  return (
    <>
      <div className={`card countdown ${locked ? 'shut' : submitted ? 'ready' : 'urgent'}`}>
        <div className="cdround">
          <strong>{round?.name}</strong>
          <span className="team"> · NFL week {round?.week}</span>
        </div>
        {live
          ? <div className="cdwhen">{points(live.running)}</div>
          : <Countdown until={lock} locked={locked} />}
        <div className="cdstate">
          {live ? (
            <>
              {points(live.banked)} banked
              {live.playing > 0 && ` · ${live.playing} playing now`}
              {live.yetToPlay > 0 && ` · ${live.yetToPlay} yet to kick off, carried at projection`}
            </>
          ) : locked ? (
            submitted ? 'Your team is in. Nothing more to do this round.' : 'The round locked without a full team from you.'
          ) : submitted ? (
            'Your team is in. You can still change it until it locks.'
          ) : (
            `Picks lock ${lock ? lock.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' }) : 'soon'}.`
          )}
        </div>
        {!locked && projectedTotal !== null && (
          <div className="cdproj">
            Projected <b>{points(projectedTotal)}</b> this round
          </div>
        )}

        {!locked && counts.length > 0 && (
          <div className="cdcounts standalone">
            {counts.map((entry) => (
              <span key={entry.level} className={`mult mult-${entry.level}`}>
                {entry.count} at {entry.level}x
              </span>
            ))}
          </div>
        )}

        {!locked && submitted && (
          <button className="ghost wide" onClick={onGoToTeam}>Change your team</button>
        )}

        {!locked && !submitted && (
          <button className="submit" onClick={onGoToTeam}>
            {roster.length === 0 ? 'Pick your nine' : `Finish your team — ${EASTSIDE.slots.length - roster.length} to go`}
          </button>
        )}
      </div>

      {gone.length > 0 && !locked && (
        <div className="card notice">
          <strong>{gone.length} of your players are out.</strong>{' '}
          {gone.map((held) => pool.get(held.playerId)?.name ?? held.playerId).join(', ')} — their clubs lost.
          Replacements start again at 1x.
        </div>
      )}

      {locked && live && roster.length > 0 && (
        <GameDay live={live} pool={pool} games={games} onGoToTeam={onGoToTeam} />
      )}

      {/* If the stat feed is unreachable there is still a team to show, just not a live one. */}
      {locked && !live && roster.length > 0 && (
        <div className="card teamcard">
          <div className="confhead">
            Your team
            {counts.length > 0 && (
              <span className="cdcounts">
                {counts.map((entry) => (
                  <span key={entry.level} className={`mult mult-${entry.level}`}>
                    {entry.count} at {entry.level}x
                  </span>
                ))}
              </span>
            )}
          </div>
          {EASTSIDE.slots.map((slot) => {
            const held = roster.find((entry) => entry.slot === slot.id);
            const person = held ? pool.get(held.playerId) : undefined;
            return (
              <PlayerRow
                key={slot.id}
                slot={slot.id}
                player={person ?? null}
                multiplier={standings.get(slot.id)?.multiplier ?? 1}
                hint={person ? fixtureLabel(games.get(person.team)) : 'still empty'}
                onClick={onGoToTeam}
              />
            );
          })}
        </div>
      )}

      <Pool contest={contest} managers={managers} commissioner={false} onChange={() => undefined} />
    </>
  );
}
