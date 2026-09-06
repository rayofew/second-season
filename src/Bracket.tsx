import { useEffect, useState } from 'react';
import { readAllTeams, readContest } from './store/firestore.ts';
import type { Contest, RoundTeams } from './store/firestore.ts';
import { colorOf, crest } from './domain/clubs.ts';

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

  useEffect(() => {
    void (async () => {
      try {
        const found = await readContest(CONTEST);
        setContest(found);
        if (found) setRounds(await readAllTeams(CONTEST, found.rounds.length));
      } catch (cause) {
        setProblem((cause as Error).message);
      }
    })();
  }, []);

  if (problem) return <div className="card gate"><p className="problem">{problem}</p></div>;
  if (!contest) return <div className="card gate"><p>Loading the bracket…</p></div>;
  return <BracketLadder contest={contest} rounds={rounds} />;
}
