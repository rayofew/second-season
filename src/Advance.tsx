import { useEffect, useState } from 'react';
import { decide, reseed } from './domain/advance.ts';
import type { Decision } from './domain/advance.ts';
import { clubScores } from './providers/schedule.ts';
import { stats } from './providers/sleeper.ts';
import { advanceRound, readPool, readScores, readTeams } from './store/firestore.ts';
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
 *
 * It also refuses a round nobody has scored, which is not a hypothetical: the Wild Card sat for
 * days with an empty scores document and a table of noughts, and nothing on any screen said so.
 * Scoring cannot happen from a browser — the rules let no client write a score, so the figures can
 * only come from the job holding the service key — and a check that can only say "go and run the
 * script" is still worth far more than finding out in February.
 */

const CONTEST = 'rehearsal-2026';

export function Advance({ contest, onDone }: { contest: Contest; onDone: () => void }) {
  const [teams, setTeams] = useState<RoundTeams | null>(null);
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [unfinished, setUnfinished] = useState<string[]>([]);
  /** How many players this round has figures for. Null until we have looked. */
  const [scored, setScored] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const round = contest.currentRound;
  const config = contest.rounds[round];

  useEffect(() => {
    void (async () => {
      try {
        const [roundTeams, board, figures] = await Promise.all([
          readTeams(CONTEST, round),
          readPool(CONTEST),
          readScores(CONTEST, round).catch(() => ({})),
        ]);
        if (!roundTeams || !config) return;
        setTeams(roundTeams);
        setScored(Object.keys(figures).length);

        const [results, lines] = await Promise.all([
          clubScores(contest.season, config.week),
          stats(contest.season, config.seasonType, config.week),
        ]);

        // Passing yards from the club's busiest quarterback, needed only when the points are tied.
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

  const unscored = scored === 0;
  const blocked = unfinished.length > 0 || unscored;

  return (
    <div className="card">
      <div className="confhead">Decide {config?.name} — NFL week {config?.week}</div>

      {/* Two things have to be true before a round can be decided, and both have been wrong once. */}
      <div className="checklist">
        <div className={`checkline ${unfinished.length === 0 ? 'ok' : 'no'}`}>
          <span>{unfinished.length === 0 ? '✓' : '×'}</span>
          {unfinished.length === 0
            ? 'Every club has finished playing.'
            : `Still playing: ${unfinished.join(', ')}.`}
        </div>
        <div className={`checkline ${unscored ? 'no' : 'ok'}`}>
          <span>{unscored ? '×' : '✓'}</span>
          {unscored
            ? 'This round has no scores yet. Nobody has been given a single point for it.'
            : `Scored — ${scored} players have figures.`}
        </div>
      </div>

      {unscored && (
        <div className="notice flat">
          <strong>Score it first.</strong> A browser cannot write a score — the rules refuse every
          client, so the figures only ever come from the job holding the key. Run this, then come
          back:
          <code className="runthis">node scripts/score.ts {round}</code>
          Advancing without it would close the week having paid nobody for it, and the bracket would
          be decided on the clubs' real results while every manager sat on nought.
        </div>
      )}

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

      {/* What one press does, said out loud. It cannot be undone from any screen. */}
      <div className="willdo">
        Pressing this marks those {decisions.length} winners, draws{' '}
        {next ? `${next.name} from the ${through.length} still standing` : 'nothing further'}, and
        {next
          ? ' opens picking for it — every manager\u2019s countdown moves to the next lock and the standings pick up this round.'
          : ' closes the contest.'}
      </div>

      <div className="summary">
        <span>
          {through.length} through to {next?.name ?? 'nothing — this is the last round'}
        </span>
        <button className="submit" disabled={busy || blocked} onClick={() => void advance()}>
          {busy ? 'Advancing…'
            : unscored ? 'Score it first'
            : unfinished.length > 0 ? 'Games still on'
            : `Advance to ${next?.name ?? 'the end'}`}
        </button>
      </div>
    </div>
  );
}
