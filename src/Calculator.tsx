import { useEffect, useState } from 'react';
import { DEFAULT_PLAN, breakdown, parseShares, problems, sharesText, tierFrom, weeklyShareOfPot } from './domain/payouts.ts';
import type { Plan, Tier } from './domain/payouts.ts';
import { setPrizes } from './store/firestore.ts';
import type { Contest } from './store/firestore.ts';
import { explain } from './domain/trouble.ts';
import { useGame } from './game.tsx';

/**
 * Where the commissioner works out the money, and then locks it in.
 *
 * Ray: "a calculator inside commish that lets me play around with percents and weekly prize spots
 * etc to figure it out. Once I lock it in, I want the rules to auto update so people know."
 *
 * Everything here is a draft until it is saved. The preview shows exactly what the site will pay
 * for any field size, worked out by the same breakdown() Standings, Home and Rules use, so what he
 * sees while choosing is what everybody is then paid. Saving a draft makes it visible on Rules as a
 * draft; locking it in removes the word draft. Either way it can be changed until the Wild Card
 * lock, and after that the database refuses any change to the money.
 */

const money = (amount: number) => `$${Math.round(amount).toLocaleString()}`;
const ORDINAL = (place: number) => (place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`);
const SAMPLES = [5, 10, 15, 20, 30, 50, 75, 100];

/**
 * Where a band ends, typed freely and taken only when the typing is done.
 *
 * Ray: "best week needs me to easily change the amount of players. rn i cant change a band without
 * issues". It applied every keystroke: typing 49 passed through 4 first, which moved that band to
 * the top of the list and dragged the others round with it before the 9 arrived. Now the number is
 * held here until Enter or a click elsewhere, then fitted between its neighbours.
 */
function BandEnd({ value, min, max, label, onCommit }: {
  value: number; min: number; max: number; label: string; onCommit: (next: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const typed = Math.floor(Number(text));
    const next = Number.isFinite(typed) && typed > 0 ? Math.min(Math.max(typed, min), Math.max(min, max)) : value;
    setText(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <input
      type="number" inputMode="numeric" value={text} aria-label={label} title={`Between ${min} and ${Math.max(min, max)}`}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
    />
  );
}

/** One band of the table, editable as "up to N" and "45/27/18/10". */
function BandRows({ tiers, onChange, what }: { tiers: Tier[]; onChange: (next: Tier[]) => void; what: string }) {
  const sorted = [...tiers].sort((a, b) => a.upTo - b.upTo);
  const set = (index: number, next: Tier | null) => {
    const copy = [...sorted];
    if (next) copy[index] = next; else copy.splice(index, 1);
    onChange(copy);
  };
  return (
    <div className="bands">
      {sorted.map((tier, index) => {
        const sum = Math.round(tier.shares.reduce((total, share) => total + share, 0) * 100) / 100;
        const last = index === sorted.length - 1;
        return (
          <div className="bandrow" key={index}>
            <span className="bandsize">
              {tierFrom(sorted, tier)}–
              {last
                ? <span title="The last band covers any field bigger than the one before it.">{tier.upTo >= 1000 ? 'any' : tier.upTo}</span>
                : (
                  <BandEnd
                    value={tier.upTo}
                    // Held between the band above and the band below, so no edit can make two bands
                    // overlap or swap places.
                    min={(sorted[index - 1]?.upTo ?? 0) + 1}
                    max={(sorted[index + 1]?.upTo ?? 1000) - 1}
                    label={`${what} band ends at`}
                    onCommit={(upTo) => set(index, { ...tier, upTo })}
                  />
                )}
              {' '}players
            </span>
            {/* The weekly bands say how many dollars come off the top each round, not a percentage. */}
            {what === 'Weekly' && (
              <label className="bandamount">
                $
                <input
                  type="number" inputMode="numeric" min={0} value={tier.amount ?? 0} aria-label="Dollars each round"
                  onChange={(event) => set(index, { ...tier, amount: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
                />
                a round, split
              </label>
            )}
            <input
              className="bandshares"
              defaultValue={sharesText(tier.shares)}
              key={sharesText(tier.shares)}
              aria-label={`${what} split for this band`}
              onBlur={(event) => set(index, { ...tier, shares: parseShares(event.target.value) })}
            />
            <span className={`bandsum ${sum === 100 ? '' : 'problem'}`}>
              {tier.shares.length} {what === 'Weekly' ? 'spots' : 'paid'} · {sum}%
            </span>
            {sorted.length > 1 && <button className="ghost small" onClick={() => set(index, null)}>Remove</button>}
          </div>
        );
      })}
      <button
        className="ghost small"
        onClick={() => {
          const top = sorted[sorted.length - 1];
          const before = sorted[sorted.length - 2];
          // A new band splits the open-ended last one in two, which is the only place one can go.
          const at = Math.max((before?.upTo ?? 0) + 2, Math.round(((before?.upTo ?? 0) + Math.min(top?.upTo ?? 100, 150)) / 2));
          onChange([...sorted.slice(0, -1), { upTo: at, shares: [...(top?.shares ?? [100])], ...(top?.amount !== undefined ? { amount: top.amount } : {}) }, ...(top ? [top] : [])]);
        }}
      >Add a band</button>
    </div>
  );
}

export function Calculator({ contest, paid, onDone }: { contest: Contest; paid: number; onDone: () => void }) {
  const CONTEST = useGame();
  const saved = contest.prizes?.plan ?? null;
  const [plan, setPlan] = useState<Plan>(saved ?? DEFAULT_PLAN);
  const [field, setField] = useState(Math.max(5, paid || 15));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const rounds = contest.rounds.length || 4;
  const lock = contest.locks['0'];
  // Once the first round has locked, nothing about this game's money can be saved — the rules refuse
  // it. With a plan already saved that plan is the final word and is shown read-only. Without one
  // (the rehearsal, which never had a plan) the calculator stays open to play with, and only saving
  // is withheld: Ray pressed Save on the rehearsal and was told he was not in the league.
  const locked = Boolean(lock && lock <= new Date());
  const frozen = locked && Boolean(saved);
  const sandbox = locked && !saved;
  const wrong = problems(plan);
  const preview = breakdown(field, plan, rounds);
  const changed = JSON.stringify(plan) !== JSON.stringify(saved);

  async function save(lockIn: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      await setPrizes(CONTEST, {
        buyIn: plan.buyIn, places: null, shares: null, weekly: 0, plan,
        ...(lockIn ? { lockedAt: new Date() } : {}),
      });
      onDone();
    } catch (cause) {
      setProblem(explain(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card calculator">
      <div className="confhead">
        Payout calculator
        <span className="colhead">
          {!saved ? 'not saved' : contest.prizes?.lockedAt ? `locked in ${contest.prizes.lockedAt.toLocaleDateString()}` : 'saved as a draft'}
        </span>
      </div>

      {frozen && (
        <div className="pending">
          The Wild Card round has locked, so the money is final. The database refuses any change to it now.
        </div>
      )}
      {sandbox && (
        <div className="pending">
          <strong>Try anything here; it won&apos;t be saved.</strong> This game&apos;s first round has already
          locked, so its money can&apos;t change. To set real payouts, switch to a January game (add one in
          Commish → Games) and use its calculator before its Wild Card lock.
        </div>
      )}

      <div className="calcrow">
        <label className="inline">
          Buy-in $
          <input
            type="number" inputMode="numeric" style={{ width: 80 }} disabled={frozen}
            value={plan.buyIn || ''}
            onChange={(event) => setPlan({ ...plan, buyIn: Math.max(0, Number(event.target.value) || 0) })}
          />
        </label>
      </div>

      <h3 className="calchead">Places, by how many have paid</h3>
      <p className="calchint">Type the split as percentages, first place first, like 45/27/18/10.</p>
      {frozen
        ? <BandsReadOnly tiers={plan.tiers} />
        : <BandRows tiers={plan.tiers} what="Places" onChange={(tiers) => setPlan({ ...plan, tiers })} />}

      <h3 className="calchead">Best week, by how many have paid</h3>
      <p className="calchint">
        The dollars taken off the top for the best raw score, every one of the {rounds} rounds, and how they split:
        100 is one winner, 60/40 pays two. The places share whatever is left.
      </p>
      {frozen
        ? <BandsReadOnly tiers={plan.weeklyTiers} />
        : <BandRows tiers={plan.weeklyTiers} what="Weekly" onChange={(weeklyTiers) => setPlan({ ...plan, weeklyTiers })} />}

      <h3 className="calchead">
        What it pays with {field} paid
        {paid > 0 && field !== paid && <button className="ghost small" onClick={() => setField(paid)}>Back to the real {paid}</button>}
      </h3>
      <input
        className="calcslider" type="range" min={2} max={120} value={field} aria-label="Field size"
        onChange={(event) => setField(Number(event.target.value))}
      />
      <div className="ruleline"><span>The pot · {field} × {money(plan.buyIn)}</span><span className="rulevalue">{money(preview.pot)}</span></div>
      <div className="ruleline">
        <span>Weekly · {preview.weeklySpots.length > 1 ? preview.weeklySpots.map(money).join(' / ') : money(preview.weeklySpots[0] ?? 0)} each round × {rounds}</span>
        <span className="rulevalue">−{money(preview.weeklyTotal)}</span>
      </div>
      <div className="ruleline total"><span>Left for the places</span><span className="rulevalue">{money(preview.placesPool)}</span></div>
      {preview.places.map((amount, index) => (
        <div className="ruleline" key={index}>
          <span>{ORDINAL(index + 1)} · {preview.shares[index]}%</span>
          <span className="rulevalue">{money(amount)}</span>
        </div>
      ))}

      <h3 className="calchead">Across field sizes</h3>
      <div className="ladder">
        <div className="ladderrow ladderhead"><span>Paid</span><span>Pot</span><span>Places</span><span>1st</span><span>2nd</span><span>3rd</span><span>Last paid</span><span>Weekly</span></div>
        {SAMPLES.map((size) => {
          const row = breakdown(size, plan, rounds);
          const last = row.places[row.places.length - 1] ?? 0;
          return (
            // Fixed weekly dollars can swallow a small field's pot, so a size where the best weeks take
            // more than half of it is flagged the same way as a last place paid less than his buy-in.
            <div
              className={`ladderrow ${last < plan.buyIn || weeklyShareOfPot(row) > 0.5 ? 'short' : ''}`}
              key={size}
              title={weeklyShareOfPot(row) > 0.5
                ? `The best weeks take ${Math.round(weeklyShareOfPot(row) * 100)}% of the pot at this size`
                : last < plan.buyIn ? 'Last paid place gets less than the buy-in back' : undefined}
            >
              <span>{size}</span><span>{money(row.pot)}</span><span>{row.places.length}</span>
              <span>{money(row.places[0] ?? 0)}</span><span>{row.places[1] !== undefined ? money(row.places[1]) : '—'}</span>
              <span>{row.places[2] !== undefined ? money(row.places[2]) : '—'}</span><span>{money(last)}</span>
              <span>{row.weeklySpots.map(money).join(' / ') || '—'}</span>
            </div>
          );
        })}
      </div>

      {sandbox && (
        <div className="summary">
          <span className="actions">
            <button className="ghost small" onClick={() => setPlan(DEFAULT_PLAN)}>Start from the suggested table</button>
          </span>
        </div>
      )}
      {wrong.length > 0 && <ul className="calcproblems">{wrong.map((line) => <li key={line} className="problem">{line}</li>)}</ul>}
      {problem && <p className="problem">{problem}</p>}

      {!locked && (
        <div className="summary">
          <span className="actions">
            <button className="ghost small" disabled={busy} onClick={() => setPlan(DEFAULT_PLAN)}>Start from the suggested table</button>
            {saved && changed && <button className="ghost small" disabled={busy} onClick={() => setPlan(saved)}>Undo changes</button>}
          </span>
          <span className="actions">
            <button className="ghost small" disabled={busy || wrong.length > 0} onClick={() => void save(false)}>Save as draft</button>
            <button className="submit small" disabled={busy || wrong.length > 0} onClick={() => void save(true)}>
              {busy ? '…' : 'Lock it in'}
            </button>
          </span>
        </div>
      )}
      <p className="calchint">
        A draft shows on the Rules page marked as a draft. Locking it in takes the word away. Either can be
        changed until the Wild Card lock; after that the money is final.
      </p>
    </div>
  );
}

function BandsReadOnly({ tiers }: { tiers: Tier[] }) {
  const sorted = [...tiers].sort((a, b) => a.upTo - b.upTo);
  return (
    <div className="bands">
      {sorted.map((tier, index) => (
        <div className="bandrow" key={index}>
          <span className="bandsize">{tierFrom(sorted, tier)}–{index === sorted.length - 1 && tier.upTo >= 1000 ? 'any' : tier.upTo} players</span>
          <span>{tier.amount !== undefined ? `$${tier.amount} a round · ` : ''}{sharesText(tier.shares)}</span>
        </div>
      ))}
    </div>
  );
}
