import { useEffect, useState } from 'react';
import { readContest, readPaidCount } from './store/firestore.ts';
import { breakdown, sharesText, tierFrom } from './domain/payouts.ts';
import type { Plan } from './domain/payouts.ts';
import type { Contest } from './store/firestore.ts';
import { EASTSIDE } from './domain/rules.ts';
import { placesFor, pot } from './domain/pool.ts';
import type { Scoring } from './domain/rules.ts';
import { useGame } from './game.tsx';

/**
 * What the game is, and what everything is worth.
 *
 * The scoring table is generated from the contest's own settings rather than typed out, so it can
 * never quietly disagree with the engine that pays people — change a value and this page changes
 * with it. A rules page that has drifted from the rules is worse than no rules page.
 */


/**
 * Whether the game this page reads is the autumn rehearsal rather than a real January one.
 *
 * While it is, the schedule shows January's expected dates instead of the rehearsal's regular-season
 * weeks, because the rehearsal is over and the page is now read by people deciding whether to play.
 * A January game's schedule is read from the game itself.
 */
const isRehearsal = (game: string) => game.startsWith('rehearsal');

/** The 2026 season's playoffs, as scheduled: week 18 is January 9–10, Super Bowl LXI is February 14. */
const UPCOMING = [
  { name: 'Wild Card', when: 'Saturday, January 16 – Monday, January 18' },
  { name: 'Divisional', when: 'Saturday, January 23 – Sunday, January 24' },
  { name: 'Conference', when: 'Sunday, January 31' },
  { name: 'Super Bowl', when: 'Sunday, February 14' },
];

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

/**
 * The bands of the places ladder, worked out by asking placesFor about every plausible field.
 *
 * Derived rather than typed so the table can never quietly disagree with what the pot actually
 * pays — the same reason the scoring tables below are generated from the contest.
 */
function placeBands(): { label: string; places: number }[] {
  const bands: { from: number; to: number; places: number }[] = [];
  for (let managers = 2; managers <= 24; managers += 1) {
    const places = placesFor(managers);
    const last = bands[bands.length - 1];
    if (last && last.places === places) last.to = managers;
    else bands.push({ from: managers, to: managers, places });
  }
  return bands.map((band, index) => ({
    label: index === 0 ? `Up to ${band.to} teams`
      : index === bands.length - 1 ? `${band.from} or more`
      : `${band.from} to ${band.to}`,
    places: band.places,
  }));
}

function Table({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="card">
      <div className="confhead">
        {title}
        <span className="colhead">Points</span>
      </div>
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
  const CONTEST = useGame();
  const [contest, setContest] = useState<Contest | null>(null);
  const [paid, setPaid] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setContest(await readContest(CONTEST));
        setPaid(await readPaidCount(CONTEST));
      } catch {
        /* fall back to the defaults below, which are what a new contest is created with anyway */
      }
    })();
  }, []);

  const scoring: Scoring = contest?.settings?.scoring ?? EASTSIDE.scoring;

  // A worked example, run through the same function that works out the real pot, so the numbers
  // here can never disagree with what the app would actually pay.
  const example = pot(10, { buyIn: 50, places: null, shares: null, weekly: 10 }, 4);
  const rounds = contest?.rounds ?? [];

  return (
    <>
      <div className="card prose lead">
        <h2>The Eastside Playoff Challenge</h2>
        <p>
          Pick nine players from the NFL playoff field. Keep the ones whose clubs survive, and every
          round you hold a player he counts for more. <strong>Most points after the Super Bowl wins.</strong>
        </p>
        <p>
          It runs on the real playoffs: fourteen clubs, seven from each conference, from Wild Card
          weekend in January to the Super Bowl in February. Every round is a real game, and the
          winner goes through.
        </p>
        <p>
          The top seed in each conference rests on Wild Card weekend. Their players score{' '}
          <strong>nothing</strong> in that round — but the round still counts towards holding them.
          Keep one and he is <strong>2x</strong> in the Divisional, <strong>3x</strong> in the
          Conference and <strong>4x</strong> in the Super Bowl, exactly like anybody you picked for
          Wild Card weekend.
        </p>
        <p>
          So you give up a round of scoring to back a club you think goes all the way. That is the
          whole gamble, and it is the only decision in the Wild Card round that is really about
          anything.
        </p>
        <p>
          Each round is decided once its games are over. Losing clubs are out, and{' '}
          <strong>their players come off your roster for you</strong> — you will find those slots
          empty, waiting to be filled from the clubs still in.
        </p>
        <p>
          This fall we played a full rehearsal over four weeks of the regular season to shake out
          the bugs. Thank you to everyone who played it and said when something looked off; how it
          finished is on the Home page.
        </p>
      </div>

      {isRehearsal(CONTEST) ? (
        <div className="card">
          <div className="confhead">January's schedule</div>
          {UPCOMING.map((round) => (
            <div className="schedule" key={round.name}>
              <span className="schedround"><strong>{round.name}</strong></span>
              <span className="schedwhen"><span>{round.when}</span></span>
            </div>
          ))}
          <div className="pending">
            Expected dates for the 2026 season's playoffs. Picks lock at each round's first kickoff,
            and the exact times go up as soon as the NFL sets them. Pick any time before the lock and
            change your mind as often as you like until then.
          </div>
        </div>
      ) : (
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
          the round plays out and I decide it once every club has finished.
        </div>
      </div>
      )}

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
          Rosters lock at the first kickoff of the week. Nobody sees anybody else's team until then —{' '}
          <strong>the commissioner included</strong>.
        </p>
        <p>
          Now and then somebody needs help with their team, and the commissioner has to open it to fix
          it. When that happens it is out in the open: he has to give a reason, it is posted on the
          Board for everybody, and the owner of the team sees it on their Home screen. That record
          can&apos;t be edited or deleted, by him or anybody else.
        </p>
      </div>

      {contest?.prizes?.plan
        ? <PlanMoney plan={contest.prizes.plan} lockedAt={contest.prizes.lockedAt} rounds={contest.rounds.length || 4} paid={paid} />
        : (
      <>
      <div className="card prose">
        <h2>The money</h2>
        <p>
          The buy-in, the weekly prize and how many places pay are set before Wild Card weekend, and
          the pot is on the Standings page from then on. <strong>Nothing is kept back</strong>: every
          dollar paid in is paid out.
        </p>
        <p>
          <strong>The more of us who play, the more places pay.</strong> Paying only the top three
          out of twenty would leave most of the room with nothing to play for by the third round,
          so the ladder widens as the field fills. Something like this:
        </p>
      </div>

      <div className="card">
        <div className="confhead">
          How many places pay
          <span className="colhead">Places</span>
        </div>
        {placeBands().map((band) => (
          <div className="ruleline" key={band.label}>
            <span>{band.label}</span>
            <span className="rulevalue">{band.places}</span>
          </div>
        ))}
        <div className="pending">
          An example, and adjustable. This is what the app falls back to if nobody says otherwise —
          the places, the buy-in and the weekly prize can all be set before we start.
        </div>
      </div>

      <div className="card prose">
        <p>
          <strong>So say ten of us play, at $50 each, with $10 a week going to the best raw
          score:</strong>
        </p>
      </div>

      <div className="card">
        <div className="confhead">Ten teams at $50</div>
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
          by somebody whose contest is already over. <strong>A tied week is split</strong> evenly
          between everybody tied for the best score.
        </p>
        <p>
          <strong>Tied at the end?</strong> Two teams on the same total are separated by, in order:
          the higher score in the <strong>Super Bowl round</strong>; then the higher score in the{' '}
          <strong>Conference round</strong>; then the most <strong>raw points</strong> across all four
          rounds, multipliers ignored. Still level after all three, they share the place and{' '}
          <strong>split the money</strong> for the places they cover — tied for first, they split
          first and second between them.
        </p>
      </div>

      </>
        )}

      <div className="card prose">
        <h2>Scoring</h2>
        <p>
          Eastside rules, the same as the regular season. Every figure below is read from the
          contest itself rather than typed here, so this page cannot drift from what actually pays.
        </p>
        {scoring.wholePoints ? (
          <p>
            <strong>Yards pay whole points.</strong> 78 receiving yards is 7, and so is 79 — the
            eighth arrives at 80. Nothing is ever rounded; the fraction simply never happens.
          </p>
        ) : (
          <p>
            <strong>Yards pay in tenths.</strong> 78 receiving yards is 7.8, not 7 — for a
            receiver, a running back and a tight end alike. Passing is a point every 25 yards, so
            a quarterback moves in units of 0.04, which is why figures here carry two decimals.
          </p>
        )}
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

    </>
  );
}

const ordinal = (place: number) => (place === 1 ? 'Winner' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`);
const dollars = (amount: number) => `$${Math.round(amount).toLocaleString()}`;
const LADDER = [5, 10, 15, 20, 30, 50, 75, 100];

/**
 * The money, as the commissioner set it in the calculator.
 *
 * Ray: "Once I lock it in, I want the rules to auto update so people know." Read from the contest
 * and worked out by the same breakdown() that pays it, so the page cannot drift from the payout.
 * Until he locks it in it says it is a draft.
 */
export function PlanMoney({ plan, lockedAt, rounds, paid }: { plan: Plan; lockedAt?: Date; rounds: number; paid: number | null }) {
  const sorted = [...plan.tiers].sort((a, b) => a.upTo - b.upTo);
  const weekly = [...plan.weeklyTiers].sort((a, b) => a.upTo - b.upTo);
  const now = paid && paid > 0 ? breakdown(paid, plan, rounds) : null;
  return (
    <>
      <div className="card prose">
        <h2>The money</h2>
        {!lockedAt && <p><strong>Draft.</strong> These are the payouts as they stand, and they may still change before Wild Card weekend.</p>}
        <p>
          The buy-in is <strong>{dollars(plan.buyIn)}</strong>. <strong>Nothing is kept back</strong>: every
          dollar paid in is paid out. The more of us who play, the bigger the pot and the more places pay.
          Only paid entries count towards the size of the field.
        </p>
        <p>
          <strong>{plan.weeklyPercent}% of the pot</strong> goes to the best raw score each round, multipliers
          ignored, so a week stays winnable by anybody — even somebody whose contest is over. The rest is
          paid to the final standings. <strong>A tied week is split</strong> between everybody level on
          it, sharing whatever the weekly spots they cover are worth.
        </p>
        <p>
          <strong>Tied at the end?</strong> Two teams on the same total are separated by, in order:
          the higher score in the <strong>Super Bowl round</strong>; then the higher score in the{' '}
          <strong>Conference round</strong>; then the most <strong>raw points</strong> across all four
          rounds, multipliers ignored. Still level after all three, they share the place and{' '}
          <strong>split the money</strong> for the places they cover — tied for first, they split
          first and second between them.
        </p>
      </div>

      {now && (
        <div className="card">
          <div className="confhead">Right now · {paid} paid</div>
          <div className="ruleline"><span>The pot</span><span className="rulevalue">{dollars(now.pot)}</span></div>
          <div className="ruleline">
            <span>Best week, each of {rounds} rounds</span>
            <span className="rulevalue">{now.weeklySpots.map(dollars).join(' / ') || '—'}</span>
          </div>
          {now.places.map((amount, index) => (
            <div className="ruleline" key={index}>
              <span>{ordinal(index + 1)} · {now.shares[index]}%</span>
              <span className="rulevalue">{dollars(amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="confhead">How many places pay<span className="colhead">Split</span></div>
        {sorted.map((tier, index) => (
          <div className="ruleline" key={tier.upTo}>
            <span>{tierFrom(sorted, tier)}{index === sorted.length - 1 ? ' or more' : `–${tier.upTo}`} players · {tier.shares.length} paid</span>
            <span className="rulevalue">{sharesText(tier.shares)}</span>
          </div>
        ))}
        {weekly.length > 0 && weekly.some((tier) => tier.shares.length > 1) && (
          <div className="pending">
            Weekly: {weekly.map((tier, index) => `${tier.shares.length === 1 ? 'one winner' : `top ${tier.shares.length} (${sharesText(tier.shares)})`} ${index === weekly.length - 1 ? `from ${tierFrom(weekly, tier)} players` : `up to ${tier.upTo}`}`).join('; ')}.
          </div>
        )}
      </div>

      <div className="card">
        <div className="confhead">What that comes to</div>
        <div className="ladder">
          <div className="ladderrow ladderhead"><span>Paid</span><span>Pot</span><span>Places</span><span>Winner</span><span>2nd</span><span>3rd</span><span>Last paid</span><span>Weekly</span></div>
          {LADDER.map((size) => {
            const row = breakdown(size, plan, rounds);
            return (
              <div className="ladderrow" key={size}>
                <span>{size}</span><span>{dollars(row.pot)}</span><span>{row.places.length}</span>
                <span>{dollars(row.places[0] ?? 0)}</span>
                <span>{row.places[1] !== undefined ? dollars(row.places[1]) : '—'}</span>
                <span>{row.places[2] !== undefined ? dollars(row.places[2]) : '—'}</span>
                <span>{dollars(row.places[row.places.length - 1] ?? 0)}</span>
                <span>{row.weeklySpots.map(dollars).join(' / ') || '—'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
