import { useEffect, useState } from 'react';
import { EASTSIDE } from './domain/rules.ts';
import { standingsFor } from './domain/multiplier.ts';
import type { HeldPlayer } from './domain/multiplier.ts';
import { readContest, readEntries, readHistory, readPool, readTeams } from './store/firestore.ts';
import type { Contest, Manager, PoolPlayer, RoundTeams } from './store/firestore.ts';
import { PlayerRow } from './PlayerRow.tsx';
import { liveRoster } from './domain/live.ts';
import type { LiveTotal } from './domain/live.ts';
import { rawPoints, display } from './domain/scoring.ts';
import type { StatLine } from './domain/scoring.ts';
import { projections, stats } from './providers/sleeper.ts';
import { clubGames } from './providers/schedule.ts';
import type { ClubGame } from './providers/schedule.ts';
import { fixtureLabel } from './domain/fixture.ts';
import { Pool } from './Pool.tsx';

/**
 * The screen somebody opens on a Sunday, in the order they need it.
 *
 * How long until picks lock comes first, because it is the only thing here that can still be acted
 * on. Then whether they have actually submitted — a manager who thinks he is in and is not is the
 * worst failure this app has — then the team itself, then what it is all for.
 *
 * Everything here exists on another tab. This is not new information; it is the same information in
 * the order that matters at the moment somebody looks.
 */

const CONTEST = 'rehearsal-2026';

/** "in 2 days", "in 5 hours", "in 43 minutes" — enough to know whether to act now. */
function until(when: Date, now: Date): string {
  const minutes = Math.round((when.getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return 'locked';
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `in ${Math.round(hours / 24)} days`;
}

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
    // The countdown is the point of the screen, so it has to actually count.
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

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
      const mine = past[round] ?? [];
      setRoster(mine);

      const config = found.rounds[round];
      if (!config || mine.length === 0) return;
      const byId = new Map(board.map((player) => [player.id, player]));
      void clubGames(found.season, config.week).then(setGames).catch(() => undefined);
      const standingNow = new Map(
        standingsFor([...past.slice(0, round), mine], round, EASTSIDE).map((entry) => [entry.slot, entry]),
      );

      // Before the lock there is nothing to watch, but there is something to expect.
      const shut = (found.locks[String(round)] ?? new Date()) <= new Date();
      if (!shut) {
        const expectedOnly = await projections(found.season, config.seasonType, config.week)
          .catch(() => ({}) as Record<string, StatLine>);
        setProjectedTotal(mine.reduce((sum, held) => {
          const points = rawPoints(held.position, expectedOnly[held.playerId], EASTSIDE);
          return sum + points * (standingNow.get(held.slot)?.multiplier ?? 1);
        }, 0));
        return;
      }
      const [actual, expected, clubs] = await Promise.all([
        stats(found.season, config.seasonType, config.week).catch(() => ({}) as Record<string, StatLine>),
        projections(found.season, config.seasonType, config.week).catch(() => ({}) as Record<string, StatLine>),
        clubGames(found.season, config.week).catch(() => new Map()),
      ]);

      setLive(liveRoster(mine.map((held) => {
        const person = byId.get(held.playerId);
        return {
          playerId: held.playerId,
          slot: held.slot,
          multiplier: standingNow.get(held.slot)?.multiplier ?? 1,
          raw: rawPoints(held.position, actual[held.playerId], EASTSIDE),
          projected: rawPoints(held.position, expected[held.playerId], EASTSIDE),
          state: person ? (clubs.get(person.team)?.state ?? 'upcoming') : 'final',
        };
      })));
    })();
  }, [uid]);

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
        <div className="cdwhen">
          {live ? display(live.running, EASTSIDE).toFixed(1) : lock ? until(lock, now) : ''}
        </div>
        <div className="cdstate">
          {live ? (
            <>
              {display(live.banked, EASTSIDE).toFixed(1)} banked
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
            Projected <b>{display(projectedTotal, EASTSIDE).toFixed(1)}</b> this round
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

      {roster.length > 0 && locked && (
        <div className="card">
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
                hint={person ? fixtureLabel(games.get(person.team)) : locked ? undefined : 'still empty'}
                right={(() => {
                  const entry = live?.players.find((candidate) => candidate.slot === slot.id);
                  if (!entry) return undefined;
                  return (
                    <span className={`livepts ${entry.state}`}>
                      <b>{display(entry.credited, EASTSIDE).toFixed(1)}</b>
                      <span className="liveraw">
                        {display(entry.counting, EASTSIDE).toFixed(1)}
                        {entry.state === 'upcoming' ? ' proj' : ''}
                      </span>
                    </span>
                  );
                })()}
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
