import { useEffect, useState } from 'react';
import { points } from './domain/scoring.ts';
import { weeklyWins } from './domain/weekly.ts';
import { defaultShares, NO_PRIZES, placesFor, pot } from './domain/pool.ts';
import type { Placing } from './domain/standings.ts';
import { explain } from './domain/trouble.ts';
import { loadTable } from './store/table.ts';
import type { Loaded } from './store/table.ts';

/**
 * The contest once it is over: who won, who got paid, and the table it all came from.
 *
 * Ray: "after tonight and we run the winner, we need the home page to display the winners". Home
 * turns into this the moment the last round is advanced, which is when the contest is marked final.
 * Before that a winner is only the man in front, and saying otherwise on the screen people open
 * first would be a promise the Super Bowl could still break.
 *
 * Worked out by the same loadTable() as Standings, so the two cannot disagree. The money is
 * the same pot() the Prize pool card uses: places first, then a dead heat splits whatever the
 * places it covers were worth, because two people tied for second have between them earned second
 * and third, not two seconds.
 */

const money = (amount: number) => `$${(Math.round(amount * 100) / 100).toLocaleString()}`;
const ORDINAL = ['Champion', '2nd', '3rd', '4th', '5th', '6th'];

/** Each placing's share of the money, splitting a tie across the places it covers. */
function payoutsFor(placings: readonly Placing[], amounts: readonly number[]): Map<string, number> {
  const paid = new Map<string, number>();
  const byRank = new Map<number, Placing[]>();
  for (const placing of placings) byRank.set(placing.rank, [...(byRank.get(placing.rank) ?? []), placing]);
  for (const [rank, tied] of byRank) {
    const covered = amounts.slice(rank - 1, rank - 1 + tied.length).reduce((sum, amount) => sum + amount, 0);
    if (covered > 0) for (const placing of tied) paid.set(placing.entryId, covered / tied.length);
  }
  return paid;
}

export function Results({ contestId, uid }: { contestId: string; uid?: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void loadTable(contestId)
      .then((found) => (found ? setLoaded(found) : setProblem('No contest found.')))
      .catch((cause) => setProblem(explain(cause)));
  }, [contestId]);

  if (problem) return <div className="card gate"><p className="problem">{problem}</p></div>;
  if (!loaded) return <div className="card gate"><p>Working out the result…</p></div>;
  return <ResultsView loaded={loaded} uid={uid} />;
}

/** The result itself, split from the fetching so the design preview can draw it with invented teams. */
export function ResultsView({ loaded, uid }: { loaded: Loaded; uid?: string }) {
  const { contest, placings, managers } = loaded;
  const logoOf = new Map(managers.map((manager) => [manager.uid, manager.logo]));
  const prizes = contest.prizes ?? NO_PRIZES;
  const places = prizes.places ?? placesFor(managers.length);
  const shares = prizes.shares?.length === places ? prizes.shares : defaultShares(places);
  const purse = pot(managers.length, { ...prizes, places, shares }, contest.rounds.length);
  const paid = payoutsFor(placings, purse.total > 0 ? purse.payouts.map((payout) => payout.amount) : []);
  const weeks = weeklyWins(placings);
  const champions = placings.filter((placing) => placing.rank === 1);
  const podium = placings.filter((placing) => placing.rank > 1 && placing.rank <= Math.max(3, purse.payouts.length));
  const runnerUp = placings.find((placing) => placing.rank > 1);

  const badge = (entryId: string, size = 'small') => {
    const logo = logoOf.get(entryId);
    return logo ? <img className={`badge ${size}`} src={logo} alt="" /> : <span className={`badge ${size} empty`} />;
  };
  const you = (entryId: string) => (uid && entryId === uid ? <span className="tag">you</span> : null);

  return (
    <>
      <div className="card champion">
        <span className="champflag">{contest.name} · {contest.season} · final</span>
        {champions.map((winner) => (
          <div className="champrow" key={winner.entryId}>
            {badge(winner.entryId, 'large')}
            <span className="champmain">
              <span className="champname">{winner.name}{you(winner.entryId)}</span>
              <span className="champline">
                {champions.length > 1 ? 'Co-champion' : 'Champion'} with <b>{points(winner.credited)}</b> points
                {runnerUp && champions.length === 1 && <>, {points(winner.credited - runnerUp.credited)} clear of {runnerUp.name}</>}
              </span>
            </span>
            {paid.has(winner.entryId) && <span className="champmoney">{money(paid.get(winner.entryId)!)}</span>}
          </div>
        ))}
      </div>

      {podium.length > 0 && (
        <div className="card">
          <div className="confhead">The places</div>
          {podium.map((placing) => (
            <div className="ruleline resultline" key={placing.entryId}>
              <span className="resultwho">
                <span className="placerank">{ORDINAL[placing.rank - 1] ?? `${placing.rank}th`}</span>
                {badge(placing.entryId)}
                {placing.name}{you(placing.entryId)}
              </span>
              <span className="rulevalue">
                {points(placing.credited)}
                {paid.has(placing.entryId) && <b className="resultmoney"> · {money(paid.get(placing.entryId)!)}</b>}
              </span>
            </div>
          ))}
        </div>
      )}

      {weeks.some((week) => week.winners.length > 0) && (
        <div className="card">
          <div className="confhead">
            Best week, every round
            {prizes.weekly > 0 && <span className="team">{money(prizes.weekly)} each</span>}
          </div>
          {weeks.map((week) => (
            <div className="weekrow" key={week.round}>
              <span className="weekname">{loaded.roundNames[week.round] ?? `Round ${week.round + 1}`}</span>
              <span className="weekwinners">
                {week.winners.map((winner) => (
                  <span className="weekwinner" key={winner.entryId}>
                    {badge(winner.entryId)}
                    {winner.name}{you(winner.entryId)}
                  </span>
                ))}
                {week.winners.length > 1 && <span className="weekshared">shared</span>}
              </span>
              <span className="weekraw">{points(week.raw)}</span>
              {prizes.weekly > 0 && week.winners.length > 0 && (
                <span className="weekmoney">
                  {week.winners.length > 1 ? `${money(prizes.weekly / week.winners.length)} each` : money(prizes.weekly)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="confhead">Final table</div>
        {placings.map((placing) => (
          <div className={`placing static ${placing.rank === 1 ? 'leader' : ''}`} key={placing.entryId}>
            <span className="placerank">{placing.rank}</span>
            {badge(placing.entryId)}
            <span className="placemain">
              <span className="placename">{placing.name}{you(placing.entryId)}</span>
            </span>
            <span className="placenums"><b>{points(placing.credited)}</b></span>
          </div>
        ))}
      </div>
    </>
  );
}
