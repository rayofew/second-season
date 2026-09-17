import { useEffect, useState } from 'react';
import { readAllTeams, readContest } from './store/firestore.ts';
import type { Contest, RoundTeams } from './store/firestore.ts';
import { colorOf, crest } from './domain/clubs.ts';
import { clubGames } from './providers/schedule.ts';
import type { ClubGame } from './providers/schedule.ts';
import { stats } from './providers/sleeper.ts';
import type { StatLine } from './domain/scoring.ts';
import { readPool } from './store/firestore.ts';
import { LiveBracket } from './LiveBracket.tsx';
import { useHeartbeat } from './useHeartbeat.ts';
import { explain } from './domain/trouble.ts';

/**
 * The whole bracket, all four rounds.
 *
 * One set of markup laid out two ways: stacked top to bottom on a phone, where a converging tree
 * would be unreadable, and four columns side by side on anything wider — which read left to right
 * is a bracket, without a second component that could drift out of step with this one.
 *
 * Not decoration either way. A player is only worth holding if his club survives, so this is the
 * screen you consult before deciding whether a 1x replacement beats a 3x incumbent.
 *
 * The ladder is split from the fetching so the design preview can drive it with invented clubs.
 */

const CONTEST = 'rehearsal-2026';

const lockDate = (when: Date) =>
  when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The Monday after a round's games, which is when it gets decided. */
function mondayAfter(lock: Date): Date {
  const monday = new Date(lock);
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
  return monday;
}

const shortDay = (when: Date) =>
  when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function Side({ club, seed, won }: { club: string; seed: number; won: boolean | null }) {
  return (
    <div className={`side ${won === true ? 'won' : ''} ${won === false ? 'out' : ''}`}>
      <span className="seed">{seed}</span>
      <img className="clubcrest" src={crest(club)} alt="" width="24" height="24" loading="lazy" />
      <span className="club" style={won === false ? undefined : { color: colorOf(club) }}>{club}</span>
    </div>
  );
}

export function BracketLadder({ contest, rounds }: { contest: Contest; rounds: (RoundTeams | null)[] }) {
  const seedOf = (club: string) => contest.field[club]?.seed ?? 0;
  const conferenceOf = (club: string) => contest.field[club]?.conference ?? '';

  return (
    <>
      <div className="ladder">
        {contest.rounds.map((round) => {
          const teams = rounds[round.round];
          const lock = contest.locks[String(round.round)];
          const current = round.round === contest.currentRound;
          const decided = teams?.matchups?.some((matchup) => matchup.winner) ?? false;

          return (
            <div className={`card rung ${current ? 'current' : ''}`} key={round.round}>
              <div className="roundhead">
                <div>
                  <strong>{round.name}</strong>
                  <span className="team"> · week {round.week}</span>
                  {lock && (
                    <div className="rounddate">
                      {decided ? `Decided ${shortDay(mondayAfter(lock))}` : `Locks ${lockDate(lock)}`}
                    </div>
                  )}
                </div>
                <span className={`state ${current ? 'now' : decided ? 'done' : ''}`}>
                  {decided ? 'decided' : current ? (lock && lock > new Date() ? 'open' : 'in play') : 'to come'}
                </span>
              </div>

              {!teams ? (
                <div className="pending">Drawn once {contest.rounds[round.round - 1]?.name} is decided.</div>
              ) : (
                ['AFC', 'NFC'].map((conference) => {
                  const resting = (teams.byes ?? []).filter((club) => conferenceOf(club) === conference);
                  const ties = teams.matchups.filter((matchup) => conferenceOf(matchup.home) === conference);
                  if (!resting.length && !ties.length) return null;

                  return (
                    <div key={conference}>
                      <div className="confhead">{conference}</div>
                      {resting.map((club) => (
                        <div className="bye" key={club}>
                          <Side club={club} seed={seedOf(club)} won={null} />
                          <span className="hint">rests — nothing now, 2x next</span>
                        </div>
                      ))}
                      {ties.map((matchup) => (
                        <div className="tie" key={`${matchup.home}-${matchup.away}`}>
                          <Side
                            club={matchup.away}
                            seed={seedOf(matchup.away)}
                            won={matchup.winner ? matchup.winner === matchup.away : null}
                          />
                          <span className="at">at</span>
                          <Side
                            club={matchup.home}
                            seed={seedOf(matchup.home)}
                            won={matchup.winner ? matchup.winner === matchup.home : null}
                          />
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      <p className="footnote">
        Clubs never actually meet. Whichever of the two scores more in its own real fixture goes
        through; tied on points, the quarterback with more passing yards; tied again, the better seed.
      </p>
    </>
  );
}

export function Bracket() {
  const [contest, setContest] = useState<Contest | null>(null);
  const [rounds, setRounds] = useState<(RoundTeams | null)[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const [fixtures, setFixtures] = useState<Map<string, ClubGame>>(new Map());
  // Passing yards only matter when two clubs finish level, which is rare and worth getting right.
  const [passing, setPassing] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    void (async () => {
      try {
        const found = await readContest(CONTEST);
        setContest(found);
        if (found) setRounds(await readAllTeams(CONTEST, found.rounds.length));
      } catch (cause) {
        setProblem(explain(cause));
      }
    })();
  }, []);

  const going = [...fixtures.values()].some((game) => game.state !== 'final');
  const beat = useHeartbeat(going, 45_000);

  /**
   * The football itself, refetched while any of it is happening.
   *
   * Only the public feeds are on the heartbeat; the bracket above comes from Firestore once, and
   * cannot change between Monday nights.
   */
  useEffect(() => {
    if (!contest) return;
    const config = contest.rounds[contest.currentRound];
    if (!config) return;
    let live = true;

    void (async () => {
      const [games, board, lines] = await Promise.all([
        clubGames(contest.season, config.week).catch(() => new Map<string, ClubGame>()),
        readPool(CONTEST).catch(() => []),
        stats(contest.season, config.seasonType, config.week)
          .catch(() => ({}) as Record<string, StatLine>),
      ]);
      if (!live) return;
      setFixtures(games);

      // A club's busiest quarterback, which is what the tiebreaker asks for.
      const yards = new Map<string, number>();
      for (const player of board) {
        if (player.position !== 'QB') continue;
        const threw = lines[player.id]?.pass_yd ?? 0;
        yards.set(player.team, Math.max(yards.get(player.team) ?? 0, threw));
      }
      setPassing(yards);
    })();

    return () => { live = false; };
  }, [contest, beat]);

  if (problem) return <div className="card gate"><p className="problem">{problem}</p></div>;
  if (!contest) return <div className="card gate"><p>Loading the bracket…</p></div>;

  const open = rounds[contest.currentRound];
  const undecided = (open?.matchups ?? []).filter((matchup) => !matchup.winner);

  return (
    <>
      <LiveBracket
        matchups={undecided}
        fixtures={fixtures}
        field={contest.field}
        passingYardsFor={(club) => passing.get(club) ?? 0}
        roundName={contest.rounds[contest.currentRound]?.name ?? 'This round'}
      />
      <BracketLadder contest={contest} rounds={rounds} />
    </>
  );
}
