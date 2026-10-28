import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { readContest, readPaidCount, readPayoutTemplate } from './store/firestore.ts';
import type { Contest } from './store/firestore.ts';
import { DEFAULT_PLAN, breakdown, split, tierFrom } from './domain/payouts.ts';
import type { Plan, Tier } from './domain/payouts.ts';
import { EASTSIDE } from './domain/rules.ts';
import type { Scoring, Slot } from './domain/rules.ts';
import { useGame, useGamePicker } from './game.tsx';
import { HeadingIcon, PayoutBar, Staircase, Timeline } from './RulesArt.tsx';

/**
 * The rules, laid out the way Ray wrote them.
 *
 * Ray: "to make sure the rules are easy to read and understand ... lets make sure there are bullet
 * points", and then "rewrite the rules page to match". The order, the headings and the wording are
 * his document's. What is not typed is anything that could drift from what actually happens: the
 * roster is read from the game's slots, every dollar from the game's payout plan through the same
 * breakdown() that pays it, and the scoring tables from the game's scoring settings. Change any of
 * those and this page changes with it — a rules page that disagrees with the rules is worse than
 * none.
 *
 * A game whose money has not been set yet shows the owner's starting table (or the suggested one),
 * marked as a draft, so people deciding whether to play can see what it will look like.
 */

const isRehearsal = (game: string) => game.startsWith('rehearsal');

/** The 2026 season's playoffs, as scheduled: week 18 is January 9–10, Super Bowl LXI is February 14. */
const UPCOMING = [
  { name: 'Wild Card', when: 'Saturday, January 16 – Monday, January 18' },
  { name: 'Divisional', when: 'Saturday, January 23 – Sunday, January 24' },
  { name: 'Conference Championships', when: 'Sunday, January 31' },
  { name: 'Super Bowl', when: 'Sunday, February 14' },
];

const dollars = (amount: number) => `$${Math.round(amount).toLocaleString()}`;
const ordinalWord = (place: number) =>
  ['First', 'Second', 'Third', 'Fourth', 'Fifth'][place - 1] ?? `${place}th`;
const dayAndTime = (when: Date) =>
  when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const per = (yards: number) => `1 per ${yards} yards`;
const signed = (value: number) => String(value);

/** "1–9", "50 or more": a band's range, as a person would say it. */
const range = (tiers: readonly Tier[], tier: Tier, index: number) => {
  const sorted = [...tiers].sort((a, b) => a.upTo - b.upTo);
  return index === sorted.length - 1 ? `${tierFrom(sorted, tier)} or more` : `${tierFrom(sorted, tier)}–${tier.upTo}`;
};

/** What each weekly spot in a band is worth, in whole dollars, the way breakdown() splits it. */
const weeklySpots = (tier: Tier) => split(tier.amount ?? 0, tier.shares);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card prose rulesection">
      <h2><HeadingIcon title={title} />{title}</h2>
      {children}
    </div>
  );
}

function Grid({ head, rows, right = [] }: { head: string[]; rows: ReactNode[][]; right?: number[] }) {
  return (
    <div className="rtablewrap">
      <table className="rtable">
        <thead><tr>{head.map((cell, index) => <th key={index} className={right.includes(index) ? 'num' : undefined}>{cell}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, at) => (
            <tr key={at}>{row.map((cell, index) => <td key={index} className={right.includes(index) ? 'num' : undefined}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The roster table, counted from the game's own slots. */
function rosterRows(slots: readonly Slot[]): [string, number][] {
  const label = (slot: Slot) => {
    if (slot.eligible.length > 1) return 'Flex: running back, wide receiver, or tight end';
    return ({ QB: 'Quarterback', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end', K: 'Kicker', DEF: 'Team defense/special teams' } as Record<string, string>)[slot.eligible[0] ?? ''] ?? slot.id;
  };
  const counts = new Map<string, number>();
  for (const slot of slots) counts.set(label(slot), (counts.get(label(slot)) ?? 0) + 1);
  return [...counts.entries()];
}

export function Rules() {
  const CONTEST = useGame();
  const [contest, setContest] = useState<Contest | null>(null);
  const [paid, setPaid] = useState<number | null>(null);
  const [template, setTemplate] = useState<Plan | null>(null);

  useEffect(() => {
    void (async () => {
      const [found, count, starting] = await Promise.all([
        readContest(CONTEST).catch(() => null),
        readPaidCount(CONTEST).catch(() => null),
        readPayoutTemplate().catch(() => null),
      ]);
      setContest(found);
      setPaid(count);
      setTemplate(starting);
    })();
  }, [CONTEST]);

  const settings = contest?.settings ?? EASTSIDE;
  const scoring: Scoring = settings.scoring ?? EASTSIDE.scoring;
  const slots = settings.slots ?? EASTSIDE.slots;
  const rows = rosterRows(slots);
  const plan = contest?.prizes?.plan ?? template ?? DEFAULT_PLAN;
  const draft = !contest?.prizes?.lockedAt;
  const rounds = (contest?.rounds?.length ?? 0) || 4;
  const schedule = contest && !isRehearsal(CONTEST) && contest.rounds.length > 0
    ? contest.rounds.map((round) => ({
      name: round.name,
      when: contest.locks?.[String(round.round)] ? `Locks ${dayAndTime(contest.locks[String(round.round)]!)}` : 'Dates to come',
    }))
    : UPCOMING;

  return (
    <>
      <Section title="How to Play">
        <ul>
          <li>Pick a fantasy team from the NFL playoff player pool.</li>
          <li>Earn points through four rounds: <strong>Wild Card, Divisional, Conference Championships, and Super Bowl</strong>.</li>
          <li>Keep players on your roster to increase their scoring multipliers.</li>
          <li><strong>The team with the most total points after the Super Bowl wins.</strong></li>
        </ul>
      </Section>

      <Section title="Signing Up">
        <ul>
          <li>Registration opens in <strong>December</strong>.</li>
          <li>Low Stakes and High Stakes are entered as <strong>separate teams</strong>. If you participate in both, manage each team separately.</li>
          {contest?.cap ? <li>This game is capped at <strong>{contest.cap} players</strong>. Once it is full, anyone else who signs up goes on a <strong>waitlist</strong> and gets in if a spot opens.</li> : null}
        </ul>
      </Section>

      <Section title="Your Roster">
        <ul>
          <li><strong>There is no draft.</strong> Everyone chooses from the same player pool.</li>
          <li>Any number of participants may select the same player.</li>
          <li>Choose players from NFL teams still in the playoffs.</li>
          <li>Fill all {slots.length} starting spots:</li>
        </ul>
        <Grid
          head={['Position', 'Number']}
          right={[1]}
          rows={[...rows.map(([label, count]) => [label, count]), [<strong key="t">Total</strong>, <strong key="n">{slots.length}</strong>]]}
        />
        <ul>
          <li>All {slots.length} spots count toward your score.</li>
          <li>There is no bench.</li>
        </ul>
      </Section>

      <Section title="Keeping Players and Building Multipliers">
        <ul>
          <li>A newly added player starts at <strong>1×</strong>.</li>
          <li>Each consecutive round you keep that player increases their multiplier, up to <strong>{rounds}×</strong>.</li>
          <li>The multiplier depends on how long you have kept the player, not which playoff round it is.</li>
        </ul>
        <Grid
          head={['Consecutive rounds on your roster', 'Multiplier', 'If the player scores 20 fantasy points']}
          right={[1, 2]}
          rows={Array.from({ length: rounds }, (_, index) => [ordinalWord(index + 1), `${index + 1}×`, `${20 * (index + 1)} points`])}
        />
        <Staircase rounds={rounds} />
        <ul>
          <li>Keeping that player for all {rounds} rounds in this example earns <strong>{Array.from({ length: rounds }, (_, index) => 20 * (index + 1)).reduce((a, b) => a + b, 0)} total points</strong>.</li>
          <li>Every replacement starts at <strong>1×</strong>, even when added in a later playoff round.</li>
          <li>If you drop a player and add them back in a later round, their multiplier starts over at <strong>1×</strong>.</li>
        </ul>
      </Section>

      <Section title="When an NFL Team Loses">
        <ul>
          <li>Once the round is finalized, players from eliminated NFL teams are <strong>automatically removed from your roster</strong>.</li>
          <li>Those roster spots stay <strong>empty until you fill them</strong>.</li>
          <li>Fill empty spots before the next round locks, using players from teams still in the playoffs.</li>
          <li>An empty spot earns no points.</li>
        </ul>
      </Section>

      <Section title="Doing Nothing Is Allowed">
        <ul>
          <li>Players whose NFL teams advance automatically carry over to the next round.</li>
          <li>Their multipliers keep increasing.</li>
          <li><strong>You do not need to resubmit an unchanged team.</strong></li>
          <li>Check your roster each round for empty spots left by eliminated players.</li>
        </ul>
      </Section>

      <Section title="Players With a Wild Card Bye">
        <ul>
          <li>You may select players whose NFL teams have a first-round bye.</li>
          <li>Those players earn <strong>zero points during Wild Card weekend</strong>.</li>
          <li>The bye still counts as a round on your roster.</li>
          <li>If you keep them continuously, they receive:</li>
        </ul>
        <Grid
          head={['Round', 'Result']}
          rows={[
            ['Wild Card', 'Zero points; bye counts toward retention'],
            ['Divisional', '2× multiplier'],
            ['Conference Championships', '3× multiplier'],
            ['Super Bowl', '4× multiplier'],
          ]}
        />
      </Section>

      <Section title="Lineup Changes, Deadlines, and Privacy">
        <ul>
          <li>You may change your lineup before each round&apos;s deadline.</li>
          <li><strong>Your entire lineup locks at that round&apos;s first kickoff.</strong></li>
          <li>Check the posted schedule for exact deadlines.</li>
          <li>You may replace a player whose team is still alive, but the replacement starts at <strong>1×</strong>.</li>
          <li>Picks are hidden from everyone else until the round locks, <strong>including the commissioner</strong>.</li>
        </ul>
        <Timeline rounds={schedule} />
        {schedule === UPCOMING && (
          <p className="rulenote">Expected dates. Exact deadlines are posted as soon as the NFL sets the kickoff times.</p>
        )}
      </Section>

      <Section title="Commissioner Assistance">
        <p>If the commissioner opens your team to help resolve a problem:</p>
        <ul>
          <li><strong>The commissioner must give a reason</strong> before your team can be opened.</li>
          <li><strong>Every player in the league is told:</strong> the reason is posted on the Board for everyone to see.</li>
          <li>A notice also appears on your Home screen.</li>
          <li>The record cannot be edited or deleted, by the commissioner or anyone else.</li>
        </ul>
      </Section>

      {/* "Right now" only for a real game with payouts of its own. On the rehearsal, or a game
          still showing the starting table, it would put a real head count beside sample money. */}
      <StakesMoney>
        <RulesMoney plan={plan} draft={draft} rounds={rounds} paid={contest?.prizes?.plan && !isRehearsal(CONTEST) ? paid : null} cap={contest?.cap ?? null} />
      </StakesMoney>

      <Section title="Fantasy Scoring">
        <ul>
          <li>The contest uses <strong>Eastside league scoring</strong>.</li>
          <li>Player and team statistics come from <strong>Sleeper</strong>.</li>
          <li>Multipliers apply to these fantasy points for overall standings.</li>
          <li>Best-week standings use these points <strong>without multipliers</strong>.</li>
        </ul>

        <h3>Passing</h3>
        <Grid head={['Stat', 'Points']} right={[1]} rows={[
          ['Passing yards', per(scoring.passingYardsPerPoint)],
          ['Passing touchdown', signed(scoring.passingTouchdown)],
          ['Interception thrown', signed(scoring.interception)],
          ['Two-point conversion', signed(scoring.twoPointConversion)],
        ]} />

        <h3>Rushing and Receiving</h3>
        <Grid head={['Stat', 'Points']} right={[1]} rows={[
          ['Reception', signed(scoring.reception)],
          ['Rushing yards', per(scoring.rushingYardsPerPoint)],
          ['Receiving yards', per(scoring.receivingYardsPerPoint)],
          ['Rushing touchdown', signed(scoring.rushingTouchdown)],
          ['Receiving touchdown', signed(scoring.receivingTouchdown)],
          ['Kickoff or punt return touchdown', signed(scoring.returnTouchdown)],
          ['Fumble lost', signed(scoring.fumbleLost)],
          ['Two-point conversion', signed(scoring.twoPointConversion)],
        ]} />

        <h3>Kicking</h3>
        <Grid head={['Stat', 'Points']} right={[1]} rows={[
          ['Extra point', signed(scoring.extraPoint)],
          ['Field goal under 40 yards', signed(scoring.fieldGoalUnder40)],
          ['Field goal from 40–49 yards', signed(scoring.fieldGoal40To49)],
          ['Field goal from 50–59 yards', signed(scoring.fieldGoal50To59)],
          ['Field goal of 60 yards or more', signed(scoring.fieldGoal60Plus)],
          [`${scoring.fieldGoalBonus.atLeast === 5 ? 'Five' : scoring.fieldGoalBonus.atLeast} or more field goals made in one game`, `${scoring.fieldGoalBonus.points} bonus points`],
        ]} />

        <h3>Defense and Special Teams</h3>
        <Grid head={['Stat', 'Points']} right={[1]} rows={[
          ['Sack', signed(scoring.sack)],
          ['Interception', signed(scoring.defensiveInterception)],
          ['Fumble recovery', signed(scoring.fumbleRecovery)],
          ['Safety', signed(scoring.safety)],
          ['Blocked kick', signed(scoring.blockedKick)],
          ['Touchdown', signed(scoring.defensiveTouchdown)],
          ['Return yards', per(scoring.returnYardsPerPoint)],
          ...scoring.pointsAllowed.map((tier, index, all): [string, string] => [
            tier.upTo === 0 ? 'Shutout' : `Allowing ${(all[index - 1]?.upTo ?? -1) + 1}–${tier.upTo} points`,
            signed(tier.points),
          ]),
          [`Allowing more than ${scoring.pointsAllowed[scoring.pointsAllowed.length - 1]?.upTo ?? 0} points`, '0 for points allowed'],
        ]} />
        <ul>
          <li>Only one points-allowed award applies per game.</li>
          <li>Other defensive and special teams points are added separately.</li>
        </ul>

        <h3>Fractional Points</h3>
        {scoring.wholePoints ? (
          <ul>
            <li>Yardage earns whole points only: 78 receiving yards earns 7, and the eighth point arrives at 80.</li>
          </ul>
        ) : (
          <ul>
            <li>Yardage earns fractional points.</li>
            <li><strong>78 rushing or receiving yards earns {(78 / scoring.receivingYardsPerPoint).toFixed(1)} points.</strong></li>
            <li>Passing yardage earns <strong>{(1 / scoring.passingYardsPerPoint).toFixed(2)} points per yard</strong>.</li>
            <li>Scores are displayed to two decimal places.</li>
          </ul>
        )}
      </Section>
    </>
  );
}

/**
 * The money for every real game, with a switch between them.
 *
 * Ray: "update the rules so it has low stakes and high stakes slider bar". Each game has its own
 * table, buy-in and cap, so the money sections — and the example slider in them — are drawn from
 * whichever stakes is picked. Nothing is picked to begin with — Ray: "make so you have to hit low stakes
 * or high stakes to see the rules/slider" — so nobody reads one game's money as the other's. Cheapest first, so with two games
 * the switch reads Low Stakes, High Stakes. Only games this person can see are offered (switched-off
 * games are the owner's alone); with none, the page shows the current game's money as before.
 */
interface Stakes { id: string; name: string; contest: Contest | null; paid: number | null }

function StakesMoney({ children }: { children: ReactNode }) {
  const picker = useGamePicker();
  const real = (picker?.games ?? []).filter((game) => !isRehearsal(game.id));
  const [stakes, setStakes] = useState<Stakes[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const ids = real.map((game) => game.id).join(',');

  useEffect(() => {
    if (real.length === 0) { setStakes([]); return; }
    let live = true;
    void Promise.all(real.map(async (game) => ({
      id: game.id,
      name: game.name,
      contest: await readContest(game.id).catch(() => null),
      paid: await readPaidCount(game.id).catch(() => null),
    }))).then((found) => {
      if (!live) return;
      const buyIn = (each: Stakes) => each.contest?.prizes?.plan?.buyIn ?? Infinity;
      setStakes([...found].sort((a, b) => buyIn(a) - buyIn(b)));
    });
    return () => { live = false; };
  }, [ids]);

  if (!stakes || stakes.length === 0) return <>{children}</>;
  const label = (index: number) => (stakes.length === 2 ? (index === 0 ? 'Low Stakes' : 'High Stakes') : stakes[index]!.name);
  const showing = stakes.find((each) => each.id === chosen) ?? null;
  const contest = showing?.contest ?? null;
  const plan = contest?.prizes?.plan ?? null;
  const rounds = (contest?.rounds?.length ?? 0) || 4;

  return (
    <>
      <nav className="subnav stakes" aria-label="Which game's money">
        {stakes.map((each, index) => (
          <button key={each.id} aria-current={each.id === showing?.id} onClick={() => setChosen(each.id === chosen ? null : each.id)}>
            {label(index)}
            {each.contest?.prizes?.plan && <span className="stakesfee">{dollars(each.contest.prizes.plan.buyIn)}</span>}
          </button>
        ))}
      </nav>
      {!showing
        ? <p className="stakespick">Pick <strong>{stakes.length === 2 ? 'Low Stakes or High Stakes' : 'a game'}</strong> to see its entry fee, prizes and payout slider.</p>
        : plan
        ? <RulesMoney key={showing.id} plan={plan} draft={!contest?.prizes?.lockedAt} rounds={rounds} paid={showing.paid} cap={contest?.cap ?? null} />
        : (
          <Section title="Entry Fees and Prize Pool">
            <p className="rulenote">
              <strong>{showing.name}:</strong> the payouts haven't been set yet.
              {contest?.cap ? ` It is capped at ${contest.cap} players.` : ''}
            </p>
          </Section>
        )}
    </>
  );
}

/**
 * The money sections, from the game's payout plan: entry fees, best-week prizes, overall prizes, a
 * worked example, and how ties are paid. Every figure is breakdown() or split(), the same arithmetic
 * that pays it, so the page cannot promise a dollar the game would not pay.
 */
export function RulesMoney({ plan, draft, rounds, paid, cap = null }: { plan: Plan; draft: boolean; rounds: number; paid: number | null; cap?: number | null }) {
  const weekly = [...plan.weeklyTiers].sort((a, b) => a.upTo - b.upTo);
  const places = [...plan.tiers].sort((a, b) => a.upTo - b.upTo);
  const spotsWide = Math.max(1, ...weekly.map((tier) => tier.shares.length));
  // Ray: "in the rules, have a slider bar so that people can see the sample payouts". It opens on ten
  // paid entries, as his written example does, and anybody can drag it to any size of field.
  const [exampleField, setExampleField] = useState(Math.min(10, cap ?? 10));
  const example = breakdown(exampleField, plan, rounds);
  const now = paid && paid > 0 ? breakdown(paid, plan, rounds) : null;
  // The tie example: the first band that pays two weekly spots, and two tied for the top of it.
  const twoSpot = weekly.find((tier) => tier.shares.length >= 2);
  const twoSpotIndex = twoSpot ? weekly.indexOf(twoSpot) : -1;
  const twoSpotPaid = twoSpot ? weeklySpots(twoSpot) : [];

  return (
    <>
      <Section title="Entry Fees and Prize Pool">
        {draft && <p className="rulenote"><strong>Draft.</strong> These amounts may still change before the Wild Card lock.</p>}
        <ul>
          <li><strong>Entry fee: {dollars(plan.buyIn)} per team.</strong></li>
          <li>Only paid entries count toward the payout schedule.</li>
          <li>All entry fees are paid out as prizes. Nothing is withheld.</li>
          <li>As the number of paid entries increases, more overall places receive prizes.</li>
          <li>Weekly prize money is set aside for all {rounds} rounds first.</li>
          <li>The remaining money funds the overall prizes.</li>
          <li><strong>The entry fee and payout structure become final at the Wild Card lineup lock.</strong></li>
          <li>Final dollar amounts are posted on the Standings and Rules pages.</li>
          <li>Overall payouts are allocated in whole dollars, with rounding adjustments so the full prize pool is paid out.</li>
        </ul>
        {now && (
          <Grid
            head={[`Right now · ${paid} paid`, 'Amount']}
            right={[1]}
            rows={[
              ['Entry fees collected', dollars(now.pot)],
              [`Best-week prizes, ${rounds} rounds`, `−${dollars(now.weeklyTotal)}`],
              ...now.places.map((amount, index) => [`${ordinalWord(index + 1)} overall`, dollars(amount)]),
            ]}
          />
        )}
      </Section>

      <Section title="Best-Week Prizes">
        <ul>
          <li>Best-week prizes are awarded in <strong>each of the {rounds} playoff rounds</strong>.</li>
          <li>Rankings use only that round&apos;s fantasy points, <strong>without multipliers</strong>.</li>
          <li>You can win a best-week prize regardless of your overall standing.</li>
          <li>All amounts below are <strong>per round</strong>.</li>
        </ul>
        <Grid
          head={['Paid entries', ...Array.from({ length: spotsWide }, (_, index) => ['1st', '2nd', '3rd'][index] ?? `${index + 1}th`), 'Per round']}
          right={Array.from({ length: spotsWide + 1 }, (_, index) => index + 1)}
          rows={weekly.map((tier, index) => {
            const spots = weeklySpots(tier);
            return [
              range(weekly, tier, index),
              ...Array.from({ length: spotsWide }, (_, spot) => (spots[spot] !== undefined ? dollars(spots[spot]!) : '—')),
              <strong key="total">{dollars(tier.amount ?? 0)}</strong>,
            ];
          })}
        />
      </Section>

      <Section title="Overall Prizes">
        <ul>
          <li>Overall standings use your combined score across all {rounds} rounds, <strong>including multipliers</strong>.</li>
          <li>The percentages below apply to the money remaining <strong>after all {rounds} rounds of best-week prizes are set aside</strong>.</li>
          <li>Prize splits are listed in order, starting with first place.</li>
        </ul>
        <Grid
          head={['Paid entries', 'Overall places paid', 'Overall prize split']}
          right={[1]}
          rows={places.map((tier, index) => [range(places, tier, index), tier.shares.length, tier.shares.map((share) => `${share}%`).join(' / ')])}
        />
      </Section>

      <Section title={`Example: ${exampleField} Paid Entries`}>
        {/* Ray: "make the slider bar more prominent, its a cool feature". A panel of its own, a thick
            gold track filled up to the value, and the three figures people actually want to know
            changing as it moves. */}
        <div className="payslider">
          <div className="payslider-top">
            <span className="payslider-ask">Drag to see the payouts for any number of paid entries</span>
            <span className="payslider-count"><b>{exampleField}</b> paid</span>
          </div>
          <input
            className="payslider-range" type="range" min={2} max={cap ?? 120} value={exampleField} aria-label="Paid entries"
            style={{ ['--fill' as string]: `${((exampleField - 2) / Math.max(1, (cap ?? 120) - 2)) * 100}%` }}
            onChange={(event) => setExampleField(Number(event.target.value))}
          />
          <div className="payslider-ends"><span>2</span><span>{cap ? `${cap} (full)` : 120}</span></div>
          <div className="payslider-figures">
            <span><small>Prize pool</small><b>{dollars(example.pot)}</b></span>
            <span><small>1st place</small><b>{dollars(example.places[0] ?? 0)}</b></span>
            <span><small>Best week, each round</small><b>{dollars(example.weeklySpots[0] ?? 0)}</b></span>
          </div>
        </div>
        <PayoutBar paid={example} rounds={rounds} />
        <Grid
          head={['Prize pool calculation', 'Amount']}
          right={[1]}
          rows={[
            [`Entry fees collected: ${exampleField} × ${dollars(plan.buyIn)}`, dollars(example.pot)],
            [`Best-week prizes: ${dollars(example.weeklySpots.reduce((a, b) => a + b, 0))} × ${rounds} rounds`, `−${dollars(example.weeklyTotal)}`],
            [<strong key="l">Remaining for overall prizes</strong>, <strong key="v">{dollars(example.placesPool)}</strong>],
          ]}
        />
        {/* What a best week pays at this size of field, every round. Ray: "the example needs to have
            the weekly prizes as well" — the table above only took their total off the top. */}
        {example.weeklySpots.length > 0 && (
          <Grid
            head={['Best week, each round', 'Prize', `All ${rounds} rounds`]}
            right={[1, 2]}
            rows={[
              ...example.weeklySpots.map((amount, index) => [
                `${ordinalWord(index + 1)} place`, <strong key={`w${index}`}>{dollars(amount)}</strong>, dollars(amount * rounds),
              ]),
              [<strong key="wt">Total</strong>, <strong key="wr">{dollars(example.weeklySpots.reduce((a, b) => a + b, 0))}</strong>, <strong key="wa">{dollars(example.weeklyTotal)}</strong>],
            ]}
          />
        )}
        <Grid
          head={['Overall finish', 'Share', 'Payout']}
          right={[1, 2]}
          rows={example.places.map((amount, index) => [ordinalWord(index + 1), `${example.shares[index]}%`, <strong key={index}>{dollars(amount)}</strong>])}
        />
        <p>
          All <strong>{dollars(example.pot)}</strong> is paid out: <strong>{dollars(example.weeklyTotal)}</strong> in
          best-week prizes and <strong>{dollars(example.placesPool)}</strong> in overall prizes.
        </p>
      </Section>

      <Section title="Overall Standings Tiebreakers">
        <p>If teams finish with the same total score, ties are resolved in this order:</p>
        <ol>
          <li>Higher Super Bowl round score, <strong>including multipliers</strong>.</li>
          <li>Higher Conference Championship round score, <strong>including multipliers</strong>.</li>
          <li>Higher combined score across all four rounds, <strong>without multipliers</strong>.</li>
        </ol>
        <p>If teams are still tied:</p>
        <ul>
          <li>Combine the prizes for the places they occupy and divide the money equally.</li>
          <li>Two teams tied for first split the first- and second-place prizes.</li>
          <li>Three teams tied for first split the first-, second-, and third-place prizes.</li>
          <li>The same rule applies at any other position.</li>
          <li>Unpaid positions contribute $0 to the combined payout.</li>
        </ul>
      </Section>

      <Section title="Best-Week Prize Ties">
        <ul>
          <li>Weekly ties are split equally. Overall standings tiebreakers do not apply.</li>
          <li>Combine the prizes for the positions occupied by the tied teams, then divide that amount equally among them.</li>
          <li>Unpaid positions contribute $0.</li>
          {twoSpot && twoSpotPaid.length >= 2 && (
            <li>
              For example, with {range(weekly, twoSpot, twoSpotIndex)} paid entries, two teams tied for first split the{' '}
              {dollars(twoSpotPaid[0]!)} and {dollars(twoSpotPaid[1]!)} prizes, receiving{' '}
              <strong>{dollars((twoSpotPaid[0]! + twoSpotPaid[1]!) / 2)} each</strong>.
            </li>
          )}
        </ul>
      </Section>
    </>
  );
}

/** Kept for the design preview, which shows the money on its own. */
export function PlanMoney({ plan, lockedAt, rounds, paid }: { plan: Plan; lockedAt?: Date; rounds: number; paid: number | null }) {
  return <RulesMoney plan={plan} draft={!lockedAt} rounds={rounds} paid={paid} />;
}
