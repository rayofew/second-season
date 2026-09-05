import { useEffect, useState } from 'react';
import { readContest } from './store/firestore.ts';
import type { Contest } from './store/firestore.ts';
import { EASTSIDE } from './domain/rules.ts';
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
  const rounds = contest?.rounds ?? [];

  return (
    <>
      <div className="card prose">
        <h2>The four weeks</h2>
        <p>
          This is a dry run. We have invented a fourteen-club playoff bracket and laid it over four
          ordinary weeks of football{rounds.length ? `, NFL weeks ${rounds[0]?.week} to ${rounds[rounds.length - 1]?.week}` : ''}.
        </p>
        <p>
          <strong>The clubs never actually play each other.</strong> Each plays whoever the real
          schedule gave them, and whichever of two bracket opponents scores more in its own fixture
          goes through. Level on points, the quarterback with more passing yards; level again, the
          better seed.
        </p>
        <p>
          Denver and Seattle have first-round byes. Their players score{' '}
          <strong>nothing</strong> in the Wild Card round — but hold one and he is worth{' '}
          <strong>2x</strong> in the Divisional, which is the whole gamble.
        </p>
        <p>
          Rounds are decided on Monday nights, once every club has played. Losing clubs are out;
          their players stay on your roster scoring nothing until you replace them.
        </p>
      </div>

      <div className="card prose">
        <h2>How the game works</h2>
        <p>
          Nine players: a quarterback, two running backs, two receivers, a tight end, a flex
          (running back, receiver or tight end), a kicker and a defence. All nine score. There is no
          bench.
        </p>
        <p>
          <strong>Hold a player and he is worth more.</strong> His first round with you pays face
          value, his second doubles, his third triples, his fourth quadruples. A quiet game from a
          man you have held all the way beats a loud one from somebody you just signed.
        </p>
        <p>
          You may drop anyone at any time — but whoever replaces him starts again at 1x, and so does
          he if you sign him back later. That reset is the only brake on transfers, and it is
          enough: to justify dropping a living player in round <em>N</em>, he has to be worth less
          than <em>1/N</em> of the man replacing him.
        </p>
        <p>
          <strong>Doing nothing is a legitimate way to play a round.</strong> Everyone who survived
          carries over and climbs.
        </p>
        <p>
          Rosters lock at the first kickoff of each round, enforced by the database rather than by
          the page. Nobody sees anybody else's picks until then — otherwise the last person to
          submit would simply copy the best team.
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
        title="Defence and special teams"
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
