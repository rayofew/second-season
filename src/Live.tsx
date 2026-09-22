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
import { silence } from './domain/resting.ts';
import { projections, stats } from './providers/sleeper.ts';
import { clubGames } from './providers/schedule.ts';
import type { ClubGame } from './providers/schedule.ts';
import {
  readAllRosters, readContest, readCorrections, readEntries, readHistory, readPool, readScores,
  readTeams,
} from './store/firestore.ts';
import type { Contest, PoolPlayer, RoundTeams } from './store/firestore.ts';
import { LiveBracket } from './LiveBracket.tsx';
import type { Held } from './LiveBracket.tsx';
import { clubPoints } from './domain/clubpoints.ts';
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


  /**
   * The statistics, with the resting clubs taken out of them.
   *
   * Done here rather than where they are fetched because the bye list and the pool arrive from
   * Firestore on a different errand from the feeds, and silencing the moment both are to hand is
   * one fewer order for two effects to get wrong. The passing yards above are deliberately not
   * silenced: they settle a tie between two clubs that played, and a resting club is in no tie.
   */
  const resting = new Set(teams?.byes ?? []);
  const clubOf = (playerId: string) => pool.get(playerId)?.team;
  const scored = silence(actual, clubOf, resting);
  const guessed = silence(expected, clubOf, resting);

  // Needed by the leaderboard and by the bracket alike, so it is worked out before either.
  const inputs: BoardInput[] = (loaded?.entries ?? []).map((entry) => {
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
          raw: rawPoints(held.position, scored[held.playerId], EASTSIDE),
          projected: projectedPoints(held.position, guessed[held.playerId], EASTSIDE),
          state,
          line: state === 'upcoming' ? guessed[held.playerId] : scored[held.playerId],
        };
      })).players,
    };
  });

  /**
   * Who has picked whom, gathered from the rosters already loaded for the leaderboard.
   *
   * Only exists once the round has locked, which is exactly right: before then nobody may know
   * what anybody else has done, and the bracket simply offers no way to ask.
   */
  const heldBy = loaded && (() => {
    // Who has whom, and at what he is worth to each of them.
    const owners = new Map<string, { name: string; multiplier: number; you: boolean }[]>();
    for (const [index, entry] of loaded.entries.entries()) {
      const row = inputs[index];
      if (!row) continue;
      for (const player of row.players) {
        const already = owners.get(player.playerId) ?? [];
        already.push({ name: entry.name, multiplier: player.multiplier, you: entry.entryId === uid });
        owners.set(player.playerId, already);
      }
    }

    // Every man in the pool, club by club, with the owners hung off him. Same function the
    // football list uses, so the two cannot end up disagreeing about what anybody scored.
    const clubs = clubPoints(
      [...pool.values()],
      scored,
      guessed,
      (club) => games.get(club)?.state ?? 'upcoming',
    );
    return new Map(
      [...clubs].map(([club, totals]): [string, Held[]] => [
        club,
        totals.players.map((player) => ({
          id: player.id,
          name: player.name,
          position: player.position,
          team: player.team,
          counting: player.counting,
          projected: player.projected,
          started: player.state !== 'upcoming',
          // The biggest multiplier first: the holder for whom the afternoon matters most.
          by: [...(owners.get(player.id) ?? [])].sort((a, b) => b.multiplier - a.multiplier),
        })),
      ]),
    );
  })();

  const bracket = (
    <LiveBracket
      matchups={(teams?.matchups ?? []).filter((matchup) => !matchup.winner)}
      fixtures={games}
      field={contest.field}
      passingYardsFor={(club) => passing.get(club) ?? 0}
      roundName={round?.name ?? 'This round'}
      resting={teams?.byes ?? []}
      heldBy={heldBy || undefined}
    />
  );

  // Before the lock the football is all there is to show, and it is not nothing.
  if (!loaded) {
    return (
      <>
        {bracket}
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


  const rows = board(inputs, race);

  return (
    <>
      {bracket}

      <div className="card">
        {/* One word, because by the time anybody has scrolled this far there is nothing else it
            could be — and the clock under it is the only other thing worth saying. */}
        <div className="scoreshead">
          <h2>Scores</h2>
          <span>
            {asOf ? `updated ${asOf.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : 'loading'}
          </span>
        </div>

        {/* One list, one switch: the same people, two different questions. */}
        <div className="races">
          <button className={race === 'contest' ? 'on' : ''} onClick={() => setRace('contest')}>
            Overall
          </button>
          <button className={race === 'week' ? 'on' : ''} onClick={() => setRace('week')}>
            Weekly prize
          </button>
        </div>
        <div className="pending">
          {race === 'contest'
            ? 'Every round added up, multipliers and all — the contest.'
            : 'This round alone, raw points with multipliers ignored — so it stays winnable by anybody.'}
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
        <span className="standingnums">
          <span className="standingnum forecast">
            <b>{points(row.total)}</b>
            <span className="numlabel">proj</span>
          </span>
          <span className="standingnum scored">
            <b>{points(row.scored)}</b>
            {row.behind > 0 && <span className="behind">−{points(row.behind)}</span>}
          </span>
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
