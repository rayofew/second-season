import { useState } from 'react';
import { collected, defaultShares, NO_PRIZES, placesFor, pot } from './domain/pool.ts';
import type { Prizes } from './domain/pool.ts';
import { setPaid, setPrizes } from './store/firestore.ts';
import type { Contest, Manager } from './store/firestore.ts';

/**
 * The buy-in, who has paid, and what each place is worth.
 *
 * Nothing here moves money. It is the ledger that otherwise lives in a group chat and gets argued
 * about in February — and seeing that two people still owe you is most of the value.
 *
 * Managers see the pot and the places. Only the commissioner sees who has not paid, because a
 * public list of debtors is a different thing from a prize table.
 */

const CONTEST = 'rehearsal-2026';
const money = (amount: number) => `$${amount.toLocaleString()}`;
const ORDINAL = ['Winner', '2nd', '3rd', '4th', '5th'];

export function Pool({
  contest,
  managers,
  commissioner,
  onChange,
}: {
  contest: Contest;
  managers: Manager[];
  commissioner: boolean;
  onChange: () => void;
}) {
  const saved: Prizes = contest.prizes ?? NO_PRIZES;
  const rounds = contest.rounds?.length ?? 4;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Prizes>(saved);
  const [busy, setBusy] = useState<string | null>(null);

  const live = editing ? draft : saved;
  const places = live.places ?? placesFor(managers.length);
  const shares = live.shares?.length === places ? live.shares : defaultShares(places);
  const table = pot(managers.length, { ...live, places, shares }, rounds);
  const paidCount = managers.filter((manager) => manager.paid).length;
  const sharesTotal = shares.reduce((sum, share) => sum + share, 0);

  async function save() {
    setBusy('prizes');
    try {
      await setPrizes(CONTEST, { ...draft, places, shares });
      setEditing(false);
      onChange();
    } finally {
      setBusy(null);
    }
  }

  async function toggle(manager: Manager) {
    setBusy(manager.uid);
    try {
      await setPaid(CONTEST, manager.uid, !manager.paid);
      onChange();
    } finally {
      setBusy(null);
    }
  }

  // Shown even when nothing has been set: an empty pot is information too, and it saves people
  // asking whether there is money in this.

  return (
    <>
      <div className="card">
        <div className="confhead">Prize pool{table.total > 0 && ` — ${money(table.total)}`}</div>

        {table.total === 0 ? (
          <div className="pending">No buy-in set — nobody is playing for money.</div>
        ) : (
          <>
            {table.payouts.map((payout) => (
              <div className="ruleline" key={payout.place}>
                <span>
                  {ORDINAL[payout.place - 1] ?? `${payout.place}th`}
                  <span className="dot"> · </span>
                  {payout.share}%
                </span>
                <span className="rulevalue">{money(payout.amount)}</span>
              </div>
            ))}
            {table.weekly > 0 && (
              <div className="ruleline">
                <span>
                  Best week, before multipliers
                  <span className="dot"> · </span>
                  {rounds} rounds
                </span>
                <span className="rulevalue">{money(live.weekly)} each</span>
              </div>
            )}
          </>
        )}

        {commissioner && !editing && (
          <div className="summary">
            <span>
              {money(collected(paidCount, saved.buyIn))} in hand of {money(table.total)}
              <span className="dot"> · </span>
              {paidCount} of {managers.length} paid
            </span>
            <button
              className="ghost small"
              onClick={() => { setDraft({ ...saved, places, shares }); setEditing(true); }}
            >
              {saved.buyIn > 0 ? 'Change' : 'Set a buy-in'}
            </button>
          </div>
        )}
      </div>

      {commissioner && editing && (
        <div className="card editor">
          <label className="inline">
            Buy-in $
            <input
              type="number" inputMode="numeric" style={{ width: 76 }}
              value={draft.buyIn || ''}
              onChange={(event) => setDraft({ ...draft, buyIn: Number(event.target.value) || 0 })}
            />
          </label>

          <label className="inline">
            Weekly prize $
            <input
              type="number" inputMode="numeric" style={{ width: 76 }}
              value={draft.weekly || ''}
              onChange={(event) => setDraft({ ...draft, weekly: Number(event.target.value) || 0 })}
            />
          </label>

          <label className="inline">
            Places paid
            <select
              value={places}
              onChange={(event) => {
                const next = Number(event.target.value);
                setDraft({ ...draft, places: next, shares: defaultShares(next) });
              }}
            >
              {[1, 2, 3, 4, 5].map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
          </label>

          <div className="splitrow">
            {shares.map((share, index) => (
              <label className="inline" key={index}>
                {ORDINAL[index] ?? `${index + 1}th`}
                <input
                  type="number" inputMode="numeric" style={{ width: 62 }}
                  value={share}
                  onChange={(event) => {
                    const next = [...shares];
                    next[index] = Number(event.target.value) || 0;
                    setDraft({ ...draft, places, shares: next });
                  }}
                />
                %
              </label>
            ))}
          </div>

          <div className="summary">
            <span className={sharesTotal === 100 ? undefined : 'problem'}>
              {sharesTotal === 100
                ? 'Adds up to 100%'
                : `Adds up to ${sharesTotal}% — the pot still divides in these proportions`}
            </span>
            <span className="actions">
              <button className="ghost small" onClick={() => setEditing(false)}>Cancel</button>
              <button className="submit small" disabled={busy === 'prizes'} onClick={() => void save()}>
                {busy === 'prizes' ? '…' : 'Save'}
              </button>
            </span>
          </div>
        </div>
      )}

      {commissioner && saved.buyIn > 0 && (
        <div className="card">
          <div className="confhead">Who has paid</div>
          {managers.map((manager) => (
            <div className="row" key={manager.uid}>
              {manager.logo ? <img className="badge" src={manager.logo} alt="" /> : <span className="badge empty" />}
              <span className="rowmain">
                <span className="rowname">{manager.teamName}</span>
                <span className="rowmeta">{manager.name}</span>
              </span>
              <button
                className={manager.paid ? 'submit small' : 'ghost small'}
                disabled={busy === manager.uid}
                onClick={() => void toggle(manager)}
              >
                {busy === manager.uid ? '…' : manager.paid ? `Paid ${money(saved.buyIn)}` : 'Not yet'}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
