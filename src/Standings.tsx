import { Fragment, useEffect, useState } from 'react';
import { EASTSIDE } from './domain/rules.ts';
import { display } from './domain/scoring.ts';
import { table } from './domain/standings.ts';
import type { Entry, Placing } from './domain/standings.ts';
import type { HeldPlayer } from './domain/multiplier.ts';
import type { StatLine } from './domain/scoring.ts';
import { readAllRosters, readContest, readCorrections, readEntries, readPool, readScores } from './store/firestore.ts';
import { PlayerRow } from './PlayerRow.tsx';
import type { Contest, Manager, PoolPlayer } from './store/firestore.ts';
import { Pool } from './Pool.tsx';

/**
 * The table, and the arithmetic behind every number in it.
 *
 * Nothing is read from a stored standing. Rosters and stat lines go in, the same table() that will
 * settle the real contest comes out — so a corrected statistic changes the standings by being
 * corrected, with nothing to recompute and nothing to remember to recompute.
 *
 * Only rounds that have locked are fetched. Before a lock the rules refuse one manager another's
 * roster, which is the rule working rather than an obstacle to it.
 */

const CONTEST = 'rehearsal-2026';

export function Standings({ uid }: { uid: string }) {
  const [placings, setPlacings] = useState<Placing[] | null>(null);
  const [names, setNames] = useState<Map<string, PoolPlayer>>(new Map());
  const [roundNames, setRoundNames] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [nextLock, setNextLock] = useState<Date | null>(null);
  const [managers, setManagers] = useState<Map<string, Manager>>(new Map());
  const [contest, setContest] = useState<Contest | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const contest = await readContest(CONTEST);
        if (!contest) { setProblem('No contest found.'); return; }
        setContest(contest);

        const now = new Date();
        const locked = contest.rounds.filter((round) => (contest.locks[String(round.round)] ?? now) <= now);
        setRoundNames(locked.map((round) => round.name));
        setNextLock(contest.locks[String(contest.currentRound)] ?? null);

        const [people, board] = await Promise.all([readEntries(CONTEST), readPool(CONTEST)]);
        setNames(new Map(board.map((player) => [player.id, player])));
        setManagers(new Map(people.map((person) => [person.uid, person])));

        // The pot is worth showing before anything has been played; the table is not.
        if (locked.length === 0) {
          setPlacings([]);
          return;
        }

        const uids = people.map((person) => person.uid);
        const statsByRound: Record<string, StatLine>[] = [];
        const correctionsByRound: Record<string, number>[] = [];
        const histories: Record<string, HeldPlayer[][]> = Object.fromEntries(uids.map((id) => [id, []]));

        for (const round of locked) {
          const [scores, rosters, fixes] = await Promise.all([
            readScores(CONTEST, round.round),
            readAllRosters(CONTEST, uids, round.round),
            readCorrections(CONTEST, round.round).catch(() => ({})),
          ]);
          statsByRound.push(scores);
          correctionsByRound.push(
            Object.fromEntries(Object.entries(fixes).map(([playerId, fix]) => [playerId, fix.raw])),
          );
          for (const id of uids) histories[id]!.push(rosters[id] ?? []);
        }

        const entries: Entry[] = people.map((person) => ({
          entryId: person.uid,
          name: person.teamName,
          history: histories[person.uid]!,
        }));
        setPlacings(table(entries, { statsByRound, correctionsByRound }, EASTSIDE));
      } catch (cause) {
        setProblem((cause as Error).message);
      }
    })();
  }, [uid]);

  if (problem) return <div className="card gate"><p className="problem">{problem}</p></div>;
  if (!placings) return <div className="card gate"><p>Working out the table…</p></div>;
  if (placings.length === 0) {
    return (
      <>
      {contest && <Pool contest={contest} managers={[...managers.values()]} commissioner={false} onChange={() => undefined} />}
      <div className="card gate">
        <h2>Everyone's team is hidden</h2>
        <p>
          Nobody sees anybody else's picks until the round locks — otherwise the last manager to
          submit would simply copy the best team.
          {nextLock && (
            <>
              <br />
              <br />
              Teams and standings appear{' '}
              <strong>
                {nextLock.toLocaleString(undefined, {
                  weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </strong>
              , at the first kickoff.
            </>
          )}
        </p>
      </div>
      </>
    );
  }

  const points = (value: number) => display(value, EASTSIDE).toFixed(1);

  const pool = contest
    ? <Pool contest={contest} managers={[...managers.values()]} commissioner={false} onChange={() => undefined} />
    : null;

  return (
    <>
      {pool}
      <div className="card scroll">
        <table>
          <thead>
            <tr>
              <th className="rank" />
              <th>Manager</th>
              {roundNames.map((name) => <th key={name}>{name}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {placings.map((placing, index) => (
              <Fragment key={placing.entryId}>
                <tr
                  className={index === 0 ? 'leader' : undefined}
                  aria-expanded={open === placing.entryId}
                  onClick={() => setOpen(open === placing.entryId ? null : placing.entryId)}
                >
                  <td className="rank">{placing.rank}</td>
                  <td>
                    <span className="manager">
                      {managers.get(placing.entryId)?.logo
                        ? <img className="badge small" src={managers.get(placing.entryId)!.logo} alt="" />
                        : <span className="badge small empty" />}
                      <span className="managername">
                        {placing.name}
                        {placing.entryId === uid && <span className="tag">you</span>}
                      </span>
                    </span>
                  </td>
                  {placing.rounds.map((round) => <td key={round.round}>{points(round.credited)}</td>)}
                  <td className="total">{points(placing.credited)}</td>
                </tr>
                {open === placing.entryId && (
                  <tr>
                    <td colSpan={roundNames.length + 3} style={{ padding: 0 }}>
                      <div className="detail">
                        {placing.rounds.map((round) => (
                          <div key={round.round}>
                            <h3>{roundNames[round.round]} — {points(round.credited)} points</h3>
                            {[...round.players]
                              .sort((first, second) => second.credited - first.credited)
                              .map((player) => {
                                const person = names.get(player.playerId);
                                return (
                                  <PlayerRow
                                    key={player.slot}
                                    slot={player.slot}
                                    player={person ?? { id: player.playerId, name: player.playerId, position: player.position, team: '' }}
                                    multiplier={player.multiplier}
                                    right={
                                      <span className="math">
                                        <span className={player.raw === 0 ? 'zero' : undefined}>{points(player.raw)}</span>
                                        {player.corrected && (
                                          <span className="fixed" title={`Imported as ${points(player.imported ?? 0)}`}>
                                            {' '}corrected
                                          </span>
                                        )}
                                        {' × '}{player.multiplier}{' = '}<b>{points(player.credited)}</b>
                                      </span>
                                    }
                                  />
                                );
                              })}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="footnote">
        Tap a manager to see every round. Nothing here is stored — rosters and statistics go in, the
        table comes out, so a corrected figure fixes the standings by being corrected.
      </p>
    </>
  );
}
