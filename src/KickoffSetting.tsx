import { useState } from 'react';
import { setNextKickoff } from './store/firestore.ts';
import type { Contest } from './store/firestore.ts';
import { ESTIMATED_KICKOFF } from './NextSeason.tsx';
import { explain } from './domain/trouble.ts';

const CONTEST = 'rehearsal-2026';

/** A Date as the value a datetime-local input wants, in the browser's own time zone. */
const asLocal = (date: Date) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
};

/**
 * Where the countdown on Home runs to.
 *
 * Until this is set the clock runs to an estimate of Wild Card weekend and says so. Once the NFL
 * publishes the playoff schedule, the first Wild Card kickoff goes in here and every visitor's clock
 * moves to it.
 */
export function KickoffSetting({ contest, onDone }: { contest: Contest; onDone: () => void }) {
  const [value, setValue] = useState(asLocal(contest.nextKickoff ?? ESTIMATED_KICKOFF));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save(when: Date | null) {
    setBusy(true);
    setProblem(null);
    try {
      await setNextKickoff(CONTEST, when);
      onDone();
    } catch (cause) {
      setProblem(explain(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="confhead">Countdown to January</div>
      <div className="pending">
        {contest.nextKickoff
          ? `Set to ${contest.nextKickoff.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
          : 'Not set, so Home counts to an estimate of Wild Card weekend and says it is an estimate.'}
        {' '}Enter the first Wild Card kickoff once the NFL publishes the schedule.
      </div>
      <div className="ruleline">
        <input
          type="datetime-local"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="First Wild Card kickoff"
        />
        <span className="rulevalue">
          <button className="ghost" disabled={busy || !value} onClick={() => void save(new Date(value))}>Save</button>
          {contest.nextKickoff && (
            <button className="ghost" disabled={busy} onClick={() => void save(null)}>Back to the estimate</button>
          )}
        </span>
      </div>
      {problem && <p className="problem">{problem}</p>}
    </div>
  );
}
