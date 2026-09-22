import { useEffect, useState } from 'react';
import { explain } from './domain/trouble.ts';
import { EASTSIDE } from './domain/rules.ts';
import { points } from './domain/scoring.ts';
import { table } from './domain/standings.ts';
import { weeklyWins, winCounts } from './domain/weekly.ts';
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

/**
 * The table cut into boxes of five.
 *
 * Five because a place is read against the places either side of it, and because fifteen managers
 * then come out as three boxes across a screen. A short league gives fewer boxes and a long one
 * more; nothing here assumes how many people are playing.
 */
function inFives<T>(all: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (let at = 0; at < all.length; at += 5) groups.push(all.slice(at, at + 5));
  return groups;
}

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
        setProblem(explain(cause));
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

  const pool = contest
    ? <Pool contest={contest} managers={[...managers.values()]} commissioner={false} onChange={() => undefined} />
    : null;

  const leader = placings[0]?.credited ?? 0;
  const groups = inFives(placings);
  const showing = placings.find((placing) => placing.entryId === open) ?? null;
  const weeks = weeklyWins(placings);
  const wins = winCounts(weeks);
  /**
   * What a week is worth, which is why anybody reads this section twice.
   *
   * Nought when the league is not collecting anything, and then the money disappears entirely
   * rather than showing a row of dollar signs with no dollars behind them.
   */
  const weekly = contest?.prizes?.weekly ?? 0;

  return (
    <>
      {pool}

      {/*
        * Three boxes of five rather than one table fifteen rows deep.
        *
        * The table carried a column per round, so it grew sideways every week and had to be
        * scrolled sideways to read by January. Nobody reads a standings table across, though —
        * they find their own name, and then whoever is immediately above it. Five at a time puts
        * the whole league on one screen with the places kept next to each other, which is the
        * comparison anybody is actually making.
        */}
      <h2 className="sectionhead">
        Overall
        <span>credited points — every round, multipliers and all</span>
      </h2>

      <div className="boards">
        {groups.map((group) => (
          <div className="card board" key={group[0]!.entryId}>
            <div className="confhead">
              {group[0]!.rank}–{group[group.length - 1]!.rank}
            </div>
            {group.map((placing) => {
              const manager = managers.get(placing.entryId);
              const behind = leader - placing.credited;
              return (
                <button
                  className={`placing ${placing.rank === 1 ? 'leader' : ''} ${open === placing.entryId ? 'open' : ''}`}
                  key={placing.entryId}
                  aria-expanded={open === placing.entryId}
                  onClick={() => setOpen(open === placing.entryId ? null : placing.entryId)}
                >
                  <span className="placerank">{placing.rank}</span>
                  {manager?.logo
                    ? <img className="badge small" src={manager.logo} alt="" />
                    : <span className="badge small empty" />}
                  <span className="placemain">
                    <span className="placename">
                      {placing.name}
                      {placing.entryId === uid && <span className="tag">you</span>}
                    </span>
                    {(wins.get(placing.entryId) ?? 0) > 0 && (
                      <span className="placewins">
                        won {wins.get(placing.entryId)} {wins.get(placing.entryId) === 1 ? 'week' : 'weeks'}
                      </span>
                    )}
                  </span>
                  <span className="placenums">
                    <b>{points(placing.credited)}</b>
                    {behind > 0 && <span className="behind">−{points(behind)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Full width underneath: nine players and their arithmetic will not fit in a third of a
          screen, and there is only ever one of these open. */}
      {showing && (
        <div className="card">
          <div className="confhead">
            {showing.name} — every round
            <button className="closedetail" onClick={() => setOpen(null)}>close</button>
          </div>
          <div className="detail">
            {showing.rounds.map((round) => (
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
                            {player.onBye && <span className="resting"> resting</span>}
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
        </div>
      )}

      <h2 className="sectionhead">
        Weekly wins
        <span>
          raw points for one round, multipliers ignored — so it stays winnable by anybody
          {weekly > 0 && ` · $${weekly} a week`}
        </span>
      </h2>

      <div className="card">
        {weeks.map((week) => (
          <div className={`weekrow ${week.winners.length === 0 ? 'unplayed' : ''}`} key={week.round}>
            <span className="weekname">{roundNames[week.round] ?? `Round ${week.round + 1}`}</span>
            {week.winners.length === 0 ? (
              <span className="weeknobody">not played yet</span>
            ) : (
              <>
                <span className="weekwinners">
                  {week.winners.map((winner) => {
                    const manager = managers.get(winner.entryId);
                    return (
                      <span className="weekwinner" key={winner.entryId}>
                        {manager?.logo
                          ? <img className="badge small" src={manager.logo} alt="" />
                          : <span className="badge small empty" />}
                        {winner.name}
                        {winner.entryId === uid && <span className="tag">you</span>}
                      </span>
                    );
                  })}
                  {week.winners.length > 1 && <span className="weekshared">shared</span>}
                </span>
                <span className="weekraw">{points(week.raw)}</span>
                {/* Split on a dead heat, because two winners and one prize is not two prizes. */}
                {weekly > 0 && (
                  <span className="weekmoney">
                    {week.winners.length > 1
                      ? `$${Math.round((weekly / week.winners.length) * 100) / 100} each`
                      : `$${weekly}`}
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <p className="footnote">
        Tap a manager for every round and every player behind the total. Nothing here is stored —
        rosters and statistics go in and the table comes out, so a corrected figure fixes the
        standings by being corrected.
      </p>
    </>
  );
}
