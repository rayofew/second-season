import { useEffect, useState } from 'react';
import { decide, reseed } from './domain/advance.ts';
import type { Decision } from './domain/advance.ts';
import { clubScores } from './providers/schedule.ts';
import { stats } from './providers/sleeper.ts';
import { advanceRound, readPool, readTeams } from './store/firestore.ts';
import type { Contest, RoundTeams } from './store/firestore.ts';
import { colorOf, crest } from './domain/clubs.ts';

/**
 * Deciding a round from the commissioner's phone.
 *
 * The same decision the script makes, from the same shared functions — this is a second way to
 * press the button, not a second opinion about who won.
 *
 * It shows the answer before it writes anything, because a round can only be advanced once and the
 * commissioner is the last check on a fixture ESPN has recorded oddly. If a club has not finished
 * playing, it says so and refuses.
 */

const CONTEST = 'rehearsal-2026';

export function Advance({ contest, onDone }: { contest: Contest; onDone: () => void }) {
  const [teams, setTeams] = useState<RoundTeams | null>(null);
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [unfinished, setUnfinished] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const round = contest.currentRound;
  const config = contest.rounds[round];

  useEffect(() => {
    void (async () => {
      try {
        const [roundTeams, board] = await Promise.all([readTeams(CONTEST, round), readPool(CONTEST)]);
        if (!roundTeams || !config) return;
        setTeams(roundTeams);

        const [results, lines] = await Promise.all([
          clubScores(contest.season, config.week),
          stats(contest.season, config.seasonType, config.week),
        ]);

        // Passing yards from the club's busiest quarterback, needed only when the points are level.
        const passingYards = (club: string) =>
          Math.max(0, ...board
            .filter((player) => player.team === club && player.position === 'QB')
            .map((player) => lines[player.id]?.pass_yd ?? 0));

        setDecisions(roundTeams.matchups.map((matchup) =>
          decide(matchup, (club) => results.get(club)?.points ?? 0, passingYards, contest.field),
        ));
        setUnfinished([...new Set(
          roundTeams.matchups.flatMap((matchup) => [matchup.home, matchup.away])
            .filter((club) => results.get(club)?.state !== 'final'),
        )]);
      } catch (cause) {
        setProblem((cause as Error).message);
      }
    })();
  }, [contest, round, config]);

  if (problem) return <div className="card gate"><p className="problem">{problem}</p></div>;
  if (!teams || !decisions) return <div className="card gate"><p>Reading the scores…</p></div>;

  const through = [...decisions.map((decision) => decision.winner), ...teams.byes];
  const pairings = reseed(through, contest.field);
  const next = contest.rounds[round + 1];

  async function advance() {
    setBusy(true);
    setProblem(null);
    try {
      await advanceRound(CONTEST, round, decisions!, through, pairings);
      onDone();
    } catch (cause) {
      setProblem((cause as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="confhead">Decide {config?.name} — NFL week {config?.week}</div>

      {unfinished.length > 0 && (
        <div className="notice flat">
          <strong>Still playing:</strong> {unfinished.join(', ')}. Wait for them — advancing now
          would count an unfinished game as nothing.
        </div>
      )}

      {decisions.map((decision) => (
        <div className="tie" key={`${decision.home}-${decision.away}`}>
          <span className="side">
            <img className="clubcrest" src={crest(decision.winner)} alt="" width="24" height="24" />
            <span className="club" style={{ color: colorOf(decision.winner) }}>{decision.winner}</span>
          </span>
          <span className="why">{decision.why}</span>
        </div>
      ))}

      <div className="summary">
        <span>
          {through.length} through to {next?.name ?? 'nothing — this is the last round'}
        </span>
        <button className="submit" disabled={busy || unfinished.length > 0} onClick={() => void advance()}>
          {busy ? 'Advancing…' : unfinished.length > 0 ? 'Games still on' : `Advance to ${next?.name ?? 'the end'}`}
        </button>
      </div>
    </div>
  );
}
