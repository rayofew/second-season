import { Countdown } from './Countdown.tsx';
import type { Contest } from './store/firestore.ts';

/**
 * How long until the real thing starts.
 *
 * Ray: "a clock that displays when the playoffs will start". It runs to the first Wild Card kickoff,
 * which is also when January's picks lock, so it is the one date anybody thinking of playing needs.
 *
 * The NFL does not set playoff kickoff times until the regular season's last weekend, so until the
 * commissioner enters the real one on Commish this runs to an estimate and says so. Wild Card
 * weekend for the 2026 season is January 16–18, 2027; the first game is usually the
 * Saturday afternoon one, 1:30 PM Pacific.
 */
export const ESTIMATED_KICKOFF = new Date('2027-01-16T21:30:00Z');

const when = (date: Date) =>
  date.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function NextSeason({ contest, onSignIn }: { contest: Contest | null; onSignIn?: () => void }) {
  const kickoff = contest?.nextKickoff ?? ESTIMATED_KICKOFF;
  const estimated = !contest?.nextKickoff;
  const started = kickoff <= new Date();

  return (
    <div className="card countdown nextseason">
      <div className="cdround">
        <strong>The {kickoff.getFullYear()} Playoff Challenge</strong>
        <span className="team"> · Wild Card weekend</span>
      </div>
      {started
        ? <div className="cdwhen">Under way</div>
        : <Countdown until={kickoff} locked={false} />}
      <div className="cdstate">
        {estimated
          ? `Around ${when(kickoff)}. The exact kickoff is set once the NFL publishes the playoff schedule.`
          : `First kickoff ${when(kickoff)}, which is also when picks lock.`}
      </div>
      {onSignIn && (
        <div className="nextjoin">
          <p>
            <strong>Sign-ups open in December.</strong> Look around in the meantime: the bracket, the
            standings and how this fall&apos;s rehearsal finished are all open to read.
          </p>
          <button className="ghost wide" onClick={onSignIn}>Already playing? Sign in</button>
        </div>
      )}
    </div>
  );
}
