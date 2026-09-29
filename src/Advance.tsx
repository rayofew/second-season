import { useEffect, useState } from 'react';
import { decide, reseed } from './domain/advance.ts';
import type { Decision } from './domain/advance.ts';
import { clubScores } from './providers/schedule.ts';
import { stats } from './providers/sleeper.ts';
import { advanceRound, readAllRosters, readEntries, readPool, readScores, readTeams } from './store/firestore.ts';
import type { Contest, RoundTeams } from './store/firestore.ts';
import { colorOf, crest } from './domain/clubs.ts';
import type { HeldPlayer } from './domain/multiplier.ts';

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
      /*
       * The next round locks at its first kickoff involving a club that is still in it.
       *
       * Worked out here rather than left as it was seeded, because the seeded lock is the first
       * game of the NFL week and by now that is often a game none of the survivors are playing in.
       */
      let nextLock: Date | undefined;
      if (next) {
        const schedule = await clubScores(contest.season, next.week).catch(() => null);
        const kickoffs = through
          .map((club) => schedule?.get(club)?.kickoff)
          .filter((when): when is Date => when instanceof Date);
        if (kickoffs.length > 0) {
          nextLock = new Date(Math.min(...kickoffs.map((when) => when.getTime())));
        }
      }

      await advanceRound(CONTEST, round, decisions!, through, pairings, nextLock);
      onDone();
    } catch (cause) {
      setProblem((cause as Error).message);
      setBusy(false);
    }
  }

  const unscored = scored === 0;
  const blocked = unfinished.length > 0 || unscored || toCarry.length > 0;

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
        <div className={`checkline ${toCarry.length > 0 ? 'no' : 'ok'}`}>
          <span>{toCarry.length > 0 ? '×' : '✓'}</span>
          {toCarry.length > 0
            ? `${toCarry.join(', ')} saved nothing this round and had a team last round.`
            : 'Everybody who had a team last round has one saved for this one.'}
        </div>
        <div className={`checkline ${unscored ? 'no' : 'ok'}`}>
          <span>{unscored ? '×' : '✓'}</span>
          {unscored
            ? 'This round has no scores yet. Nobody has been given a single point for it.'
            : `Scored — ${scored} players have figures.`}
        </div>
      </div>

      {toCarry.length > 0 && (
        <div className="notice flat">
          <strong>Carry their teams over first.</strong> Doing nothing is a legitimate way to play a
          round — the picker opens with last round's survivors already in the slots — but nothing is
          saved unless somebody presses submit. Write it down for them, then score:
          <code className="runthis">node scripts/carry-over.ts {round} --write</code>
          Whoever went out is left as an empty slot, and a manager who has never submitted anything
          has nothing to carry.
        </div>
      )}

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
          ? ' opens picking for it, and sets its lock to the first kickoff any of them are playing in — every manager\u2019s countdown moves to that, and the standings pick up this round.'
          : ' closes the contest.'}
      </div>

      <div className="summary">
        <span>
          {through.length} through to {next?.name ?? 'nothing — this is the last round'}
        </span>
        <button className="submit" disabled={busy || blocked} onClick={() => void advance()}>
          {busy ? 'Advancing…'
            : toCarry.length > 0 ? 'Carry them over first'
            : unscored ? 'Score it first'
            : unfinished.length > 0 ? 'Games still on'
            : `Advance to ${next?.name ?? 'the end'}`}
        </button>
      </div>
    </div>
  );
}
