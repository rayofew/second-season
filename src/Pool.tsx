import { useState } from 'react';
import { collected, payouts, placesFor } from './domain/pool.ts';
import { setBuyIn, setPaid } from './store/firestore.ts';
import type { Contest, Manager } from './store/firestore.ts';

/**
 * The buy-in, who has paid, and what each place is worth.
 *
 * Nothing here moves money. It is the ledger that otherwise lives in a group chat and gets argued
 * about in February — and being able to see that two people still owe you is most of the value.
 *
 * Managers see the pot and the places. Only the commissioner sees who has not paid, because a
 * public list of debtors is a different thing from a prize table.
 */

const CONTEST = 'rehearsal-2026';
const money = (amount: number) => `${amount.toLocaleString()}`;

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
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(contest.buyIn ?? 0));
  const [busy, setBusy] = useState<string | null>(null);

  const buyIn = contest.buyIn ?? 0;
  const places = contest.payoutPlaces ?? placesFor(managers.length);
  const split = payouts(managers.length, buyIn, places);
  const paidCount = managers.filter((manager) => manager.paid).length;
  const inHand = collected(paidCount, buyIn);
  const pot = managers.length * buyIn;

  async function save() {
    setBusy('buyin');
    try {
      await setBuyIn(CONTEST, Number(amount) || 0, contest.payoutPlaces ?? null);
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

  if (buyIn === 0 && !commissioner) return null;

  return (
    <>
      <div className="card">
        <div className="confhead">
          Prize pool{buyIn > 0 && ` — ${money(pot)}`}
        </div>

        {buyIn === 0 ? (
          <div className="pending">Nobody is playing for anything yet.</div>
        ) : (
          split.map((payout) => (
            <div className="ruleline" key={payout.place}>
              <span>
                {payout.place === 1 ? 'Winner' : `${payout.place}${['st', 'nd', 'rd', 'th', 'th'][payout.place - 1]}`}
                <span className="dot"> · </span>
                {payout.share}%
              </span>
              <span className="rulevalue">{money(payout.amount)}</span>
            </div>
          ))
        )}

        {commissioner && (
          <div className="summary">
            {editing ? (
              <>
                <label className="inline">
                  Buy-in $
                  <input
                    type="number"
                    inputMode="numeric"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    style={{ width: 80 }}
                  />
                </label>
                <button className="submit small" disabled={busy === 'buyin'} onClick={() => void save()}>
                  {busy === 'buyin' ? '…' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <span>
                  {money(inHand)} in hand of {money(pot)} · {paidCount} of {managers.length} paid
                </span>
                <button className="ghost small" onClick={() => setEditing(true)}>
                  {buyIn > 0 ? `Buy-in ${money(buyIn)}` : 'Set a buy-in'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {commissioner && buyIn > 0 && (
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
                {busy === manager.uid ? '…' : manager.paid ? `Paid ${money(buyIn)}` : 'Not yet'}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
