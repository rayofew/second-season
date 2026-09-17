import { EASTSIDE } from './domain/rules.ts';
import { dialable, formatPhone } from './domain/phone.ts';
import type { Application, Manager } from './store/firestore.ts';

/**
 * Who has a team in, who has not, and how to reach the ones who have not.
 *
 * Those are one question. Nobody looks up a phone number for the fun of it — they look it up at
 * four o'clock on a Thursday because three people still have not picked, so the status and the
 * number belong on the same row and the people still missing belong at the top.
 *
 * A count of slots rather than a yes or no, because a roster of four is not a roster. Somebody who
 * started and wandered off used to read as done, and he is exactly the manager most worth chasing.
 *
 * Phone numbers and email addresses live on applications rather than entries, because an entry is
 * readable by the whole league and neither was given to the whole league.
 */

const FULL = EASTSIDE.slots.length;

export function Contacts({
  managers,
  applications,
  filled,
  round,
}: {
  managers: Manager[];
  /** Every application, including those already admitted — where the details actually live. */
  applications: Application[];
  /** Slots filled for the open round, by manager. */
  filled: Map<string, number>;
  round: string;
}) {
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
    return (
      <div className="row">
        {manager.logo ? <img className="badge" src={manager.logo} alt="" /> : <span className="badge empty" />}
        <span className="rowmain">
          <span className="rowname">{manager.teamName}</span>
          <span className="rowmeta">{found?.name || manager.name}</span>
          <span className="contactlinks">
            {phone
              ? <a href={`sms:${dialable(phone)}`}>{formatPhone(phone)}</a>
              : <span className="nocontact">no number</span>}
            {email
              ? <a href={`mailto:${email}`}>{email}</a>
              : <span className="nocontact">no email yet</span>}
          </span>
        </span>
        <span className={slots >= FULL ? 'keeps' : 'resets'}>
          {slots >= FULL ? 'in' : slots === 0 ? 'nothing' : `${slots} of ${FULL}`}
        </span>
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
        on his own. A number only ever comes from the join form, and it is optional there.
      </div>
    </div>
  );
}
