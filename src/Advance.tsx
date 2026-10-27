import { useEffect, useState } from 'react';
import { decide } from './domain/advance.ts';
import type { Decision } from './domain/advance.ts';
import { clubScores } from './providers/schedule.ts';
import { stats } from './providers/sleeper.ts';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase.ts';
import { readAllRosters, readEntries, readPool, readScores, readTeams } from './store/firestore.ts';
import type { Contest, RoundTeams } from './store/firestore.ts';
import { colorOf, crest } from './domain/clubs.ts';
import type { HeldPlayer } from './domain/multiplier.ts';
import { useGame } from './game.tsx';

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


export function Advance({ contest, onDone }: { contest: Contest; onDone: () => void }) {
  const CONTEST = useGame();
  const [teams, setTeams] = useState<RoundTeams | null>(null);
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [unfinished, setUnfinished] = useState<string[]>([]);
  /** How many players this round has figures for. Null until we have looked. */
  const [scored, setScored] = useState<number | null>(null);
  /**
   * Managers with nothing saved for this round who had a team last round.
   *
   * Doing nothing is a legitimate way to play a round and the picker has always said so — it opens
   * with last round's survivors already in the slots. But nothing is saved unless somebody presses
   * submit, so a manager who looked at a good team and closed the tab scores nought, which is not
   * what anybody agreed to. The carry-over has to be written down before the round is scored.
   */
  const [toCarry, setToCarry] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** What the press did, said back once it has. */
  const [done, setDone] = useState<string | null>(null);

  const round = contest.currentRound;
  const config = contest.rounds[round];

  useEffect(() => {
    void (async () => {
      try {
        const [roundTeams, board, figures, people] = await Promise.all([
          readTeams(CONTEST, round),
          readPool(CONTEST),
          readScores(CONTEST, round).catch(() => ({})),
          readEntries(CONTEST).catch(() => []),
        ]);
        if (!roundTeams || !config) return;
        setTeams(roundTeams);
        setScored(Object.keys(figures).length);

        /*
         * Only once the round has shut.
         *
         * Before the lock a missing team is not a missing team, it is somebody who has not got
         * round to it yet and still has until Sunday. Flagging it then would put fifteen names in
         * red every Monday for six days running, which is how a warning stops being read.
         */
        const shut = (contest.locks[String(round)] ?? new Date()) <= new Date();
        if (shut && round > 0 && people.length > 0) {
          const uids = people.map((person) => person.uid);
          const empty: Record<string, HeldPlayer[]> = {};
          const [now, before] = await Promise.all([
            readAllRosters(CONTEST, uids, round).catch(() => empty),
            readAllRosters(CONTEST, uids, round - 1).catch(() => empty),
          ]);
          setToCarry(people
            .filter((person) => (now[person.uid]?.length ?? 0) === 0 && (before[person.uid]?.length ?? 0) > 0)
            .map((person) => person.teamName));
        }

        const [results, lines] = await Promise.all([
          clubScores(contest.season, config.week, config.seasonType),
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

  if (done) return <div className="card notice done"><strong>Done.</strong> {done}</div>;
  if (problem) return <div className="card gate"><p className="problem">{problem}</p></div>;
  if (!teams || !decisions) return <div className="card gate"><p>Reading the scores…</p></div>;

  const through = [...decisions.map((decision) => decision.winner), ...teams.byes];
  const next = contest.rounds[round + 1];

  /**
   * One press: score, carry over, copy the lineups, decide and advance.
   *
   * Ray: "i want it to be a one and done situation." The scoring has to happen where the credentials
   * are, and a browser is refused them on purpose — so this asks the scoreAndAdvance function on
   * Firebase to do it all, and it re-checks everything this screen has already shown (the lock, the
   * games, that whoever asked is a commissioner) before writing anything.
   */
  async function advance() {
    setBusy(true);
    setProblem(null);
    try {
      const run = httpsCallable<{ game: string }, { scoredPlayers: number; carried: string[]; next: string | null }>(
        functions, 'scoreAndAdvance', { timeout: 180_000 },
      );
      const { data } = await run({ game: CONTEST });
      setDone(`Scored ${data.scoredPlayers} players${data.carried.length ? `, carried over ${data.carried.join(', ')}` : ''}, and ${data.next ? `opened ${data.next}` : 'closed the game'}.`);
      onDone();
    } catch (cause) {
      setProblem((cause as Error).message);
      setBusy(false);
    }
  }

  // Scoring and carrying over are part of the press now; the one thing still worth waiting for is a
  // game that has not finished, because the function would refuse it anyway.
  const blocked = unfinished.length > 0;

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
        <div className="checkline ok">
          <span>✓</span>
          {toCarry.length > 0
            ? `${toCarry.join(', ')} saved nothing this round, so last round's survivors will be carried over for them.`
            : 'Everybody who had a team last round has one saved for this one.'}
        </div>
        <div className="checkline ok">
          <span>✓</span>
          {(scored ?? 0) > 0
            ? `Scored already — ${scored} players have figures. Pressing scores it again from Sleeper, which picks up any corrections.`
            : 'Scores come straight from Sleeper when you press — nobody types a figure in.'}
        </div>
      </div>

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
        Pressing this scores the round from Sleeper, carries over anybody who saved nothing, marks those{' '}
        {decisions.length} winners, draws{' '}
        {next ? `${next.name} from the ${through.length} still standing` : 'nothing further'}, and
        {next
          ? ' opens picking for it, and sets its lock to the first kickoff any of them are playing in — every manager\u2019s countdown moves to that, and the standings pick up this round.'
          : ' closes the contest.'}
      </div>

      <div className="summary">
        <span>
          {through.length} through to {next?.name ?? 'nothing — this is the last round'}
        </span>
        <button className="submit" disabled={busy || blocked} onClick={() => void advance()}>
          {busy ? 'Advancing…'
            : unfinished.length > 0 ? 'Games still on'
            : next ? `Score and advance to ${next.name}` : 'Score and finish the game'}
        </button>
      </div>
    </div>
  );
}
