import { useEffect, useState } from 'react';
import { readContest, readTeams } from './store/firestore.ts';
import type { Contest, RoundTeams } from './store/firestore.ts';

/**
 * The bracket, so a manager can reason about who is likely to still be playing in three weeks.
 *
 * That is the entire game — a player is only worth holding if his club survives — so the bracket is
 * not decoration. It is the thing you consult before deciding whether a 1x replacement is worth
 * more than a 3x incumbent.
 */

const CONTEST = 'rehearsal-2026';

function Side({ club, seed, won }: { club: string; seed: number; won: boolean | null }) {
  return (
    <div className={`side ${won === true ? 'won' : ''} ${won === false ? 'out' : ''}`}>
      <span className="seed">{seed}</span>
      <span className="club">{club}</span>
    </div>
  );
}

export function Bracket() {
  const [contest, setContest] = useState<Contest | null>(null);
  const [teams, setTeams] = useState<RoundTeams | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const found = await readContest(CONTEST);
        setContest(found);
        if (found) setTeams(await readTeams(CONTEST, found.currentRound));
      } catch (cause) {
        setProblem((cause as Error).message);
      }
    })();
  }, []);

  if (problem) return <div className="card gate"><p className="problem">{problem}</p></div>;
  if (!contest || !teams) return <div className="card gate"><p>Loading the bracket…</p></div>;

  const round = contest.rounds[contest.currentRound];
  const lock = contest.locks[String(contest.currentRound)];
  const byConference = (name: string) => teams.matchups.filter((m) => contest.field[m.home]?.conference === name);

  return (
    <>
      <div className="card roundbar">
        <div>
          <strong>{round?.name}</strong>
          <span className="team"> · NFL week {round?.week}</span>
        </div>
        <div className="team">
          {lock && lock > new Date()
            ? `locks ${lock.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
            : 'locked'}
        </div>
      </div>

      {['AFC', 'NFC'].map((conference) => {
        const resting = teams.byes.find((club) => contest.field[club]?.conference === conference);
        return (
          <div className="card" key={conference}>
            <div className="confhead">{conference}</div>
            {resting && (
              <div className="bye">
                <Side club={resting} seed={contest.field[resting]!.seed} won={null} />
                <span className="hint">rests this round — scores nothing, returns at 2x</span>
              </div>
            )}
            {byConference(conference).map((matchup) => (
              <div className="tie" key={`${matchup.home}-${matchup.away}`}>
                <Side
                  club={matchup.away}
                  seed={contest.field[matchup.away]?.seed ?? 0}
                  won={matchup.winner ? matchup.winner === matchup.away : null}
                />
                <span className="at">at</span>
                <Side
                  club={matchup.home}
                  seed={contest.field[matchup.home]?.seed ?? 0}
                  won={matchup.winner ? matchup.winner === matchup.home : null}
                />
              </div>
            ))}
          </div>
        );
      })}

      <p className="footnote">
        Clubs never actually meet. Whichever of the two scores more in its own real fixture goes
        through; level on points, the quarterback with more passing yards; level again, the better seed.
      </p>
    </>
  );
}
