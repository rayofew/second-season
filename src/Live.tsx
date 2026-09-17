import { useCallback, useEffect, useState } from 'react';
import { EASTSIDE } from './domain/rules.ts';
import { standingsFor } from './domain/multiplier.ts';
import type { HeldPlayer } from './domain/multiplier.ts';
import { board } from './domain/board.ts';
import { table } from './domain/standings.ts';
import type { BoardInput, BoardRow, Race } from './domain/board.ts';
import { liveRoster } from './domain/live.ts';
import { points, projectedPoints, rawPoints } from './domain/scoring.ts';
import type { StatLine } from './domain/scoring.ts';
import { statLine } from './domain/statline.ts';
import type { Position } from './domain/rules.ts';
import { explain } from './domain/trouble.ts';
import { projections, stats } from './providers/sleeper.ts';
import { clubGames } from './providers/schedule.ts';
import type { ClubGame } from './providers/schedule.ts';
import {
  readAllRosters, readContest, readCorrections, readEntries, readHistory, readPool, readScores,
  readTeams,
} from './store/firestore.ts';
import type { Contest, PoolPlayer, RoundTeams } from './store/firestore.ts';
import { LiveBracket } from './LiveBracket.tsx';
import { Games } from './Games.tsx';
import { PlayerRow } from './PlayerRow.tsx';
import { useHeartbeat } from './useHeartbeat.ts';

/**
 * Everybody, right now.
 *
 * Home is your own afternoon and Standings is the contest once the dust has settled; this is the
 * hour in between, when ten people are watching the same football and want to know where they are
 * in it.
 *
 * Nothing appears before the lock, and that is the rule working rather than an obstacle to it: the
 * database refuses one manager another's roster until the first kickoff, so there is nothing here
 * to show and nothing here that could leak.
 */

const CONTEST = 'rehearsal-2026';
const HEARTBEAT = 45_000;

interface Loaded {
  /** Every manager's roster for the open round, plus what he was credited in the rounds before. */
  entries: { entryId: string; name: string; before: number; roster: HeldPlayer[]; history: HeldPlayer[][] }[];
}

export function Live({ uid }: { uid: string }) {
  const [contest, setContest] = useState<Contest | null>(null);
  const [teams, setTeams] = useState<RoundTeams | null>(null);
  const [pool, setPool] = useState<Map<string, PoolPlayer>>(new Map());
  /** The leaderboard half. Null until the round locks, because until then there is nothing to see. */
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [games, setGames] = useState<Map<string, ClubGame>>(new Map());
  const [actual, setActual] = useState<Record<string, StatLine>>({});
  const [expected, setExpected] = useState<Record<string, StatLine>>({});
  const [race, setRace] = useState<Race>('contest');
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [locked, setLocked] = useState<boolean | null>(null);
  const [asOf, setAsOf] = useState<Date | null>(null);

  /** Firestore once. None of it can change while a round is being played. */
  const load = useCallback(async () => {
    try {
      const contest = await readContest(CONTEST);
      if (!contest) { setProblem('No contest found.'); return; }
      setContest(contest);
      const round = contest.currentRound;
      const [roundTeams, board] = await Promise.all([
        readTeams(CONTEST, round).catch(() => null),
        readPool(CONTEST).catch(() => []),
      ]);
      setTeams(roundTeams);
      setPool(new Map(board.map((player) => [player.id, player])));

      const lock = contest.locks[String(round)];
      const shut = lock ? lock <= new Date() : false;
      setLocked(shut);
      // The football below is public. Everybody else's nine is not, until the first kickoff.
      if (!shut) return;

      const people = await readEntries(CONTEST);
      const uids = people.map((person) => person.uid);
      const [rosters, histories] = await Promise.all([
        readAllRosters(CONTEST, uids, round),
        Promise.all(uids.map((id) => readHistory(CONTEST, id, round).catch(() => []))),
      ]);

      /**
       * What everybody is carrying into this round.
       *
       * Worked out by the same table() that settles the contest, over the rounds that have
       * already finished — not stored and not added up here, because two ways of totalling a
       * contest is one way too many and the leaderboard would be the one that was wrong.
       */
      const before = new Map<string, number>();
      if (round > 0) {
        const past = await Promise.all(
          Array.from({ length: round }, async (_, earlier) => ({
            stats: await readScores(CONTEST, earlier).catch(() => ({})),
            fixes: await readCorrections(CONTEST, earlier).catch(() => ({})),
          })),
        );
        const placings = table(
          people.map((person, index) => ({
            entryId: person.uid,
            name: person.teamName,
            history: (histories[index] ?? []).slice(0, round),
          })),
          {
            statsByRound: past.map((entry) => entry.stats),
            correctionsByRound: past.map((entry) =>
              Object.fromEntries(Object.entries(entry.fixes).map(([id, fix]) => [id, fix.raw]))),
          },
          EASTSIDE,
        );
        for (const placing of placings) before.set(placing.entryId, placing.credited);
      }

      setLoaded({
        entries: people.map((person, index) => ({
          entryId: person.uid,
          name: person.teamName,
          before: before.get(person.uid) ?? 0,
          roster: rosters[person.uid] ?? [],
          history: histories[index] ?? [],
        })),
      });
    } catch (cause) {
      setProblem(explain(cause));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const going = [...games.values()].some((game) => game.state !== 'final');
  const beat = useHeartbeat(going, HEARTBEAT);

  /** The public feeds, asked again on every heartbeat. */
  useEffect(() => {
    if (!contest) return;
    const config = contest.rounds[contest.currentRound];
    if (!config) return;
    let live = true;

    void (async () => {
      const [clubs, real, guess] = await Promise.all([
        clubGames(contest.season, config.week).catch(() => new Map<string, ClubGame>()),
        stats(contest.season, config.seasonType, config.week)
          .catch(() => ({}) as Record<string, StatLine>),
        projections(contest.season, config.seasonType, config.week)
          .catch(() => ({}) as Record<string, StatLine>),
      ]);
      if (!live) return;
      setGames(clubs);
      setActual(real);
      setExpected(guess);
      setAsOf(new Date());
    })();

    return () => { live = false; };
  }, [contest, beat]);

  if (problem) return <div className="card gate"><p className="problem">{problem}</p></div>;
  if (!contest) return <div className="card gate"><p>Loading…</p></div>;

  const round = contest.rounds[contest.currentRound];

  /**
   * A club's busiest quarterback, for the one tie that finishes level on points.
   *
   * Cheap to work out and almost never needed, which is exactly why it should not be a separate
   * fetch nobody remembers to make.
   */
  const passing = new Map<string, number>();
  for (const player of pool.values()) {
    if (player.position !== 'QB') continue;
    const threw = actual[player.id]?.pass_yd ?? 0;
    passing.set(player.team, Math.max(passing.get(player.team) ?? 0, threw));
  }

  const football = (
    <Games
      alive={teams?.alive ?? []}
      byes={teams?.byes ?? []}
      games={games}
      pool={[...pool.values()]}
      actual={actual}
      expected={expected}
      roundName={round?.name ?? 'This round'}
    />
  );

  const bracket = (
    <LiveBracket
      matchups={(teams?.matchups ?? []).filter((matchup) => !matchup.winner)}
      fixtures={games}
      field={contest.field}
      passingYardsFor={(club) => passing.get(club) ?? 0}
      roundName={round?.name ?? 'This round'}
    />
  );

  // Before the lock the football is all there is to show, and it is not nothing.
  if (!loaded) {
    return (
      <>
        {bracket}
        {football}
        <div className="card gate">
          <h2>{locked === false ? "Everybody's team is sealed" : 'Working out where everybody is…'}</h2>
          {locked === false && (
            <p>
              Nobody sees anybody else's nine until the first kickoff, or the last manager to submit
              would simply copy the best one. The table fills in the moment the round locks.
            </p>
          )}
        </div>
      </>
    );
  }

  const inputs: BoardInput[] = loaded.entries.map((entry) => {
    const standing = new Map(
      standingsFor(entry.history, contest.currentRound, EASTSIDE)
        .map((held) => [held.slot, held.multiplier]),
    );
    return {
      entryId: entry.entryId,
      name: entry.name,
      before: entry.before,
      players: liveRoster(entry.roster.map((held) => {
        const person = pool.get(held.playerId);
        const state = person ? (games.get(person.team)?.state ?? 'upcoming') : 'final';
        return {
          playerId: held.playerId,
          slot: held.slot,
          multiplier: standing.get(held.slot) ?? 1,
          raw: rawPoints(held.position, actual[held.playerId], EASTSIDE),
          projected: projectedPoints(held.position, expected[held.playerId], EASTSIDE),
          state,
          line: state === 'upcoming' ? expected[held.playerId] : actual[held.playerId],
        };
      })).players,
    };
  });

  const rows = board(inputs, race);

  return (
    <>
      {bracket}
      {football}

      <div className="card">
        <div className="confhead">
          {round?.name}
          <span className="colhead">
            {asOf ? `updated ${asOf.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : 'loading'}
          </span>
        </div>

        {/* One list, one switch: the same ten people, two different questions. */}
        <div className="races">
          <button className={race === 'contest' ? 'on' : ''} onClick={() => setRace('contest')}>
            Contest
          </button>
          <button className={race === 'week' ? 'on' : ''} onClick={() => setRace('week')}>
            This week
          </button>
        </div>
        <div className="pending">
          {race === 'contest'
            ? 'Credited points, multipliers and all.'
            : 'Raw points this round, multipliers ignored — so it stays winnable by anybody.'}
        </div>

        {rows.map((row) => (
          <Standing
            key={row.entryId}
            row={row}
            you={row.entryId === uid}
            open={open === row.entryId}
            pool={pool}
            onToggle={() => setOpen(open === row.entryId ? null : row.entryId)}
          />
        ))}
      </div>
    </>
  );
}

function Standing({
  row,
  you,
  open,
  pool,
  onToggle,
}: {
  row: BoardRow;
  you: boolean;
  open: boolean;
  pool: Map<string, PoolPlayer>;
  onToggle: () => void;
}) {
  return (
    <div className={`standing ${you ? 'you' : ''} ${open ? 'opened' : ''}`}>
      <button className="standinghead" onClick={onToggle} aria-expanded={open}>
        <span className="standingrank">{row.rank}</span>
        <span className="standingmain">
          <span className="standingname">
            {row.name}
            {you && <span className="tag">you</span>}
          </span>
          {/* How much of the total is real. Two managers on one number, two different afternoons. */}
          <span className="settledbar" aria-hidden="true">
            <span style={{ width: `${Math.round(row.settled * 100)}%` }} />
          </span>
          <span className="standingstate">
            {row.done} done
            {row.playing > 0 && ` · ${row.playing} playing`}
            {row.left > 0 && ` · ${row.left} to come`}
          </span>
        </span>
        <span className="standingtotal">
          <b>{points(row.total)}</b>
          {row.behind > 0 && <span className="behind">−{points(row.behind)}</span>}
        </span>
      </button>

      {open && (
        <div className="standingteam">
          {row.players.length === 0 ? (
            <div className="pending">Nothing submitted for this round.</div>
          ) : row.players.map((player) => {
            const person = pool.get(player.playerId);
            return (
              <PlayerRow
                key={player.slot}
                slot={player.slot}
                player={person ?? null}
                multiplier={player.multiplier}
                stats={person ? statLine(person.position as Position, player.line) : undefined}
                right={
                  <span className={`livepts ${player.state}`}>
                    <b>{points(player.credited)}</b>
                    <span className="liveraw">
                      {points(player.counting)}
                      {player.state === 'upcoming' ? ' proj' : ''}
                    </span>
                  </span>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
