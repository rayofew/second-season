import { useState } from 'react';
import { EASTSIDE } from './domain/rules.ts';
import { dialable, formatPhone } from './domain/phone.ts';
import { sinceWords } from './domain/seen.ts';
import type { Application, Manager, StandInRegister } from './store/firestore.ts';

/**
 * Everybody in the league, once.
 *
 * The commissioner's tab had grown four separate lists of the same fifteen people: who had picked,
 * who had opened the app, who had paid, and who could be made a commissioner or removed. Each was
 * a reasonable card on its own and together they meant reading the same names four times and
 * scrolling between them to put two facts side by side.
 *
 * So one row a manager, carrying every fact about him, with the actions folded away until asked
 * for — because on a Thursday evening the question is "who still has not picked and what is his
 * number", and every button on screen is in the way of it.
 *
 * Still to pick first, because those are the people the screen exists for. A count of slots rather
 * than a yes or no, since a roster of four is not a roster and the man who started and wandered off
 * is the one most worth chasing.
 *
 * Phone numbers and email addresses come from applications rather than entries: an entry is
 * readable by the whole league and neither was given to the whole league.
 */

const FULL = EASTSIDE.slots.length;
const money = (amount: number) => `$${amount.toLocaleString()}`;

export function Managers({
  managers,
  applications,
  filled,
  round,
  standIns,
  uid,
  owner,
  commissioners,
  buyIn,
  busy,
  confirming,
  onConfirm,
  onEdit,
  onCommish,
  onRemove,
  onPaid,
}: {
  managers: Manager[];
  /** Every application ever written, admitted ones included — where the details actually live. */
  applications: Application[];
  /** Slots filled for the open round, by manager. */
  filled: Map<string, number>;
  round: string;
  standIns: StandInRegister;
  uid: string;
  /** Whoever set the contest up. The rules refuse any update that drops him. */
  owner: string | undefined;
  commissioners: string[];
  /** Nought when the league is not collecting anything, which hides the money entirely. */
  buyIn: number;
  busy: string | null;
  confirming: string | null;
  onConfirm: (uid: string | null) => void;
  onEdit: (manager: Manager) => void;
  onCommish: (manager: Manager) => void;
  onRemove: (manager: Manager) => void;
  onPaid: (manager: Manager) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const detail = new Map(applications.map((application) => [application.uid, application]));
  const slotsOf = (manager: Manager) => filled.get(manager.uid) ?? 0;

  const waiting = managers
    .filter((manager) => slotsOf(manager) < FULL)
    .sort((first, second) => slotsOf(second) - slotsOf(first));
  const ready = managers
    .filter((manager) => slotsOf(manager) >= FULL)
    .sort((first, second) => first.teamName.localeCompare(second.teamName));

  const texts = waiting
    .map((manager) => detail.get(manager.uid)?.phone)
    .filter((phone): phone is string => Boolean(phone))
    .map(dialable);

  function Row({ manager }: { manager: Manager }) {
    const found = detail.get(manager.uid);
    const phone = found?.phone ?? '';
    const email = found?.email ?? '';
    const slots = slotsOf(manager);
    const standIn = Boolean(standIns[manager.uid]);
    const showing = open === manager.uid;

    return (
      <div className={`row contactrow ${showing ? 'open' : ''}`}>
        <div className="contactline">
          {manager.logo ? <img className="badge" src={manager.logo} alt="" /> : <span className="badge empty" />}

          <span className="rowmain">
            <span className="contacttop">
              <span className="rowname">{manager.teamName}</span>
              <span className="rowwho">{found?.name || manager.name}</span>
              {manager.uid === uid && <span className="tag">you</span>}
              {manager.uid === owner ? (
                <span className="tag">owner</span>
              ) : commissioners.includes(manager.uid) ? (
                <span className="tag">commish</span>
              ) : null}
              {standIn && <span className="tag">stand-in</span>}
            </span>

            <span className="contactlinks">
              {phone
                ? <a href={`sms:${dialable(phone)}`}>{formatPhone(phone)}</a>
                : <span className="nocontact">no number</span>}
              {email
                ? <a href={`mailto:${email}`}>{email}</a>
                : <span className="nocontact">no email yet</span>}
            </span>

            {/* A stand-in is played from this screen and will never sign in, so it is not news. */}
            <span className="rowfacts">
              {!standIn && (
                <span className={manager.lastSeen ? '' : 'cold'}>
                  {manager.lastSeen ? `last in ${sinceWords(manager.lastSeen)}` : 'never opened it'}
                </span>
              )}
              {!standIn && manager.visits > 0 && (
                <span>{manager.visits} visit{manager.visits === 1 ? '' : 's'}</span>
              )}
              {buyIn > 0 && (
                <span className={manager.paid ? 'settled' : 'owing'}>
                  {manager.paid ? `paid ${money(buyIn)}` : `owes ${money(buyIn)}`}
                </span>
              )}
            </span>
          </span>

          <span className={slots >= FULL ? 'keeps' : 'resets'}>
            {slots >= FULL ? 'in' : slots === 0 ? 'nothing' : `${slots} of ${FULL}`}
          </span>

          <button
            className="rowmore"
            aria-expanded={showing}
            aria-label={`Things to do with ${manager.teamName}`}
            onClick={() => { setOpen(showing ? null : manager.uid); onConfirm(null); }}
          >
            {showing ? '▴' : '▾'}
          </button>
        </div>

        {showing && (
          <div className="rowactions">
            {buyIn > 0 && (
              <button
                className={manager.paid ? 'submit small' : 'ghost small'}
                disabled={busy === manager.uid}
                onClick={() => onPaid(manager)}
              >
                {busy === manager.uid ? '…' : manager.paid ? `Paid ${money(buyIn)}` : 'Mark paid'}
              </button>
            )}

            <button className="ghost small" onClick={() => onEdit(manager)}>Team</button>

            {manager.uid !== owner && (
              <button
                className={commissioners.includes(manager.uid) ? 'submit small' : 'ghost small'}
                disabled={busy === manager.uid}
                onClick={() => onCommish(manager)}
              >
                {commissioners.includes(manager.uid) ? 'Stand down' : 'Make commish'}
              </button>
            )}

            {manager.uid !== uid && (
              <button
                className="danger small"
                disabled={busy === manager.uid}
                onClick={() => (confirming === manager.uid ? onRemove(manager) : onConfirm(manager.uid))}
              >
                {confirming === manager.uid ? 'Sure? Remove' : 'Remove'}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="confhead">
        {round}
        <span className="colhead">{ready.length} of {managers.length} in</span>
      </div>

      {/* A bar, because "7 of 10" takes reading and a mostly-full line does not. */}
      <div
        className="readybar"
        role="img"
        aria-label={`${ready.length} of ${managers.length} have a full team in`}
      >
        <span style={{ width: `${managers.length ? (ready.length / managers.length) * 100 : 0}%` }} />
      </div>

      {waiting.length === 0 ? (
        <div className="pending">Everybody has a full team in. Nothing to chase.</div>
      ) : (
        <>
          <div className="grouphead">
            Still to pick — {waiting.length}
            {texts.length > 1 && (
              <a className="textall" href={`sms:${texts.join(',')}`}>Text all {texts.length}</a>
            )}
          </div>
          {waiting.map((manager) => <Row key={manager.uid} manager={manager} />)}
        </>
      )}

      {ready.length > 0 && (
        <>
          <div className="grouphead">In — {ready.length}</div>
          {ready.map((manager) => <Row key={manager.uid} manager={manager} />)}
        </>
      )}

      <div className="pending">
        An email appears the next time somebody opens the app, so anybody who joined earlier fills in
        on his own. A number only ever comes from the join form, where it is optional. "Never opened
        it" means the link either did not arrive or did not get them past the sign-in — worth a text
        before Thursday rather than after it.
      </div>
    </div>
  );
}
