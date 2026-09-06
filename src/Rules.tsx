import { useEffect, useState } from 'react';
import { readContest } from './store/firestore.ts';
import type { Contest } from './store/firestore.ts';
import { EASTSIDE } from './domain/rules.ts';
import { pot } from './domain/pool.ts';
import type { Scoring } from './domain/rules.ts';

/**
 * What the game is, and what everything is worth.
 *
 * The scoring table is generated from the contest's own settings rather than typed out, so it can
 * never quietly disagree with the engine that pays people — change a value and this page changes
 * with it. A rules page that has drifted from the rules is worse than no rules page.
 */

const CONTEST = 'rehearsal-2026';

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** The Monday after a round's games, which is when it gets decided. */
function mondayAfter(lock: Date): Date {
  const monday = new Date(lock);
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
  monday.setHours(20, 0, 0, 0);
  return monday;
}

const dayAndTime = (when: Date) =>
  when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const day = (when: Date) => when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const per = (yards: number) => `1 per ${yards} yds`;

function Table({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="card">
      <div className="confhead">{title}</div>
      {rows.map(([label, value]) => (
        <div className="ruleline" key={label}>
          <span>{label}</span>
          <span className="rulevalue">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function Rules() {
  const [contest, setContest] = useState<Contest | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setContest(await readContest(CONTEST));
      } catch {
        /* fall back to the defaults below, which are what a new contest is created with anyway */
      }
    })();
  }, []);

  const scoring: Scoring = contest?.settings?.scoring ?? EASTSIDE.scoring;

  // A worked example, run through the same function that works out the real pot, so the numbers
  // here can never disagree with what the app would actually pay.
  const example = pot(10, { buyIn: 50, places: 3, shares: [50, 30, 20], weekly: 10 }, 4);
  const rounds = contest?.rounds ?? [];

  return (
    <>
      <div className="card prose">
        <h2>The four weeks</h2>
        <p>
          This is a test, to shake out the bugs before January. <strong>There is no winner at the
          end</strong> — nothing here counts for anything except finding out what breaks.
        </p>
        <p>
          I have invented a fourteen-club playoff bracket and laid it over four ordinary weeks of
          football{rounds.length ? `, NFL weeks ${rounds[0]?.week} to ${rounds[rounds.length - 1]?.week}` : ''}.
        </p>
        <p>
          <strong>The clubs never actually play each other.</strong> Each plays whoever the real
          schedule gave them, and whichever of your two bracket clubs scores more in its own game
          goes through. Tied on points, the quarterback with more passing yards wins it. Still tied,
          the better seed.
        </p>
        <p>
          Denver and Seattle have first-round byes. Their players score <strong>nothing</strong> in
          the Wild Card round — but hold one and he is worth <strong>2x</strong> in the Divisional,
          which is the whole gamble.
        </p>
        <p>
          Rounds are decided on Monday nights, once every club has played. Losing clubs are out,
          and <strong>their players come off your roster for you</strong> — you will find those
          slots empty, waiting to be filled from the clubs still in.
        </p>
      </div>

      <div className="card">
        <div className="confhead">The schedule</div>
        {rounds.map((round) => {
          const lock = contest?.locks?.[String(round.round)];
          return (
            <div className="schedule" key={round.round}>
              <span className="schedround">
                <strong>{round.name}</strong>
                <span className="rowmeta">NFL week {round.week}</span>
              </span>
              <span className="schedwhen">
                {lock ? (
                  <>
                    <span>Picks lock <strong>{dayAndTime(lock)}</strong></span>
                    <span className="rowmeta">Decided {day(mondayAfter(lock))}</span>
                  </>
                ) : (
                  <span className="rowmeta">dates to come</span>
                )}
              </span>
            </div>
          );
        })}
        <div className="pending">
          Pick any time before the lock; change your mind as often as you like until then. After it,
          the round plays out and I decide it on the Monday night, once every club has finished.
        </div>
      </div>

      <div className="card prose">
        <h2>How the game works</h2>
        <p>
          Nine players: a quarterback, two running backs, two receivers, a tight end, a flex
          (running back, receiver or tight end), a kicker and a defense. All nine score. There is no
          bench.
        </p>
        <p>
          <strong>Hold a player and he is worth more every round.</strong> Say the same man scores
          twenty points every week:
        </p>
      </div>

      <div className="card">
        <div className="confhead">The same twenty points, four weeks running</div>
        {['Wild Card', 'Divisional', 'Conference', 'Super Bowl'].map((name, index) => (
          <div className="ruleline" key={name}>
            <span>{name}</span>
            <span className="rulevalue">
              20 × <span className={`mult mult-${index + 1}`}>{index + 1}x</span> = {20 * (index + 1)}
            </span>
          </div>
        ))}
        <div className="ruleline total">
          <span>Held all four rounds</span>
          <span className="rulevalue">200 points</span>
        </div>
      </div>

      <div className="card prose">
        <p>
          The same player, the same performance every week — worth two hundred if you keep him, or
          eighty if you sign somebody new each round. That is the game.
        </p>
        <p>
          <strong>You can drop anyone, any time.</strong> But whoever replaces him starts back at
          1x, and so does he if you sign him again later. Knocked-out players leave on their own, so
          the only man you will ever choose to drop is one who is hurt — and even then, think twice
          about what his multiplier is worth.
        </p>
        <p>
          <strong>Doing nothing is a perfectly good way to play a round.</strong> Everyone still in
          carries over and climbs.
        </p>
        <p>
          Rosters lock at the first kickoff of the week. Nobody sees anybody else's team until then.
        </p>
      </div>

      <div className="card prose">
        <h2>The money, as an example</h2>
        <p>
          Nothing below is settled — the buy-in and the split are mine to set, and whatever they end
          up being will show on the Home screen. This is only to explain how it divides.
        </p>
        <p>
          <strong>Assuming ten teams, a $50 buy-in, $10 a week for the best raw score, and
          paying first through third:</strong>
        </p>
      </div>

      <div className="card">
        <div className="confhead">Assuming 10 teams at $50</div>
        <div className="ruleline">
          <span>The pot · 10 × $50</span>
          <span className="rulevalue">${example.total}</span>
        </div>
        <div className="ruleline">
          <span>Best week · $10 × 4 rounds</span>
          <span className="rulevalue">−${example.weekly}</span>
        </div>
        <div className="ruleline total">
          <span>Left for the places</span>
          <span className="rulevalue">${example.places}</span>
        </div>
        {example.payouts.map((payout) => (
          <div className="ruleline" key={payout.place}>
            <span>
              {['Winner', '2nd', '3rd', '4th', '5th'][payout.place - 1]}
              <span className="dot"> · </span>
              {payout.share}% of ${example.places}
            </span>
            <span className="rulevalue">${payout.amount}</span>
          </div>
        ))}
      </div>

      <div className="card prose">
        <p>
          So the winner takes <strong>${example.payouts[0]?.amount}</strong>, second{' '}
          <strong>${example.payouts[1]?.amount}</strong>, third{' '}
          <strong>${example.payouts[2]?.amount}</strong>, and ${example.weekly} goes out across the four
          weeks in $10 lots. It adds up to the ${example.total} that went in — nothing is kept back.
        </p>
        <p>
          The weekly prize is <strong>raw points, multipliers ignored</strong>, so it stays winnable
          by somebody whose contest is already over. Ties go to the better quarterback; still level,
          the quarterback and the first running back together; and on down the roster until somebody
          is ahead.
        </p>
      </div>

      <Table
        title="Passing"
        rows={[
          ['Yards', per(scoring.passingYardsPerPoint)],
          ['Touchdown', signed(scoring.passingTouchdown)],
          ['Interception', signed(scoring.interception)],
          ['Two point conversion', signed(scoring.twoPointConversion)],
        ]}
      />

      <Table
        title="Rushing and receiving"
        rows={[
          ['Reception', signed(scoring.reception)],
          ['Rushing yards', per(scoring.rushingYardsPerPoint)],
          ['Receiving yards', per(scoring.receivingYardsPerPoint)],
          ['Rushing touchdown', signed(scoring.rushingTouchdown)],
          ['Receiving touchdown', signed(scoring.receivingTouchdown)],
          ['Kick or punt return touchdown', signed(scoring.returnTouchdown)],
          ['Fumble lost', signed(scoring.fumbleLost)],
          ['Two point conversion', signed(scoring.twoPointConversion)],
        ]}
      />

      <Table
        title="Kicking"
        rows={[
          ['Extra point', signed(scoring.extraPoint)],
          ['Field goal under 40', signed(scoring.fieldGoalUnder40)],
          ['Field goal 40 to 49', signed(scoring.fieldGoal40To49)],
          ['Field goal 50 to 59', signed(scoring.fieldGoal50To59)],
          ['Field goal 60 or more', signed(scoring.fieldGoal60Plus)],
          [`Bonus for ${scoring.fieldGoalBonus.atLeast} in a game`, signed(scoring.fieldGoalBonus.points)],
        ]}
      />

      <Table
        title="Defense and special teams"
        rows={[
          ['Sack', signed(scoring.sack)],
          ['Interception', signed(scoring.defensiveInterception)],
          ['Fumble recovery', signed(scoring.fumbleRecovery)],
          ['Safety', signed(scoring.safety)],
          ['Blocked kick', signed(scoring.blockedKick)],
          ['Touchdown', signed(scoring.defensiveTouchdown)],
          ['Return yards', per(scoring.returnYardsPerPoint)],
          ...scoring.pointsAllowed.map((tier): [string, string] => [
            tier.upTo === 0 ? 'Shutout' : `Concede ${tier.upTo} or fewer`,
            signed(tier.points),
          ]),
        ]}
      />

      <p className="footnote">
        Every figure above is read from the contest itself, not typed out here, so this page cannot
        drift from the engine that actually pays people.
      </p>
    </>
  );
}
