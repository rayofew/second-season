import { dialable, formatPhone } from './domain/phone.ts';
import type { Application, Manager } from './store/firestore.ts';

/**
 * How to reach everybody, for the commissioner and nobody else.
 *
 * Phone numbers and email addresses live on applications rather than entries, because an entry is
 * readable by the whole league and neither of those was given to the whole league. That is the
 * right rule and it had an obvious hole: the moment somebody was admitted, his application dropped
 * out of the waiting list and his number went with it — so the contact details existed and could
 * not be looked at, which for chasing a manager who has not picked is the same as not having them.
 *
 * Tap to text, tap to write. Nobody is going to retype a phone number off a screen on a Thursday
 * evening with four people still to chase.
 */

export function Contacts({
  managers,
  applications,
  submitted,
  round,
}: {
  managers: Manager[];
  /** Every application, including those already admitted — where the details actually live. */
  applications: Application[];
  /** Who has a roster in for the open round, so the people worth chasing come first. */
  submitted: Set<string>;
  round: string;
}) {
  const detail = new Map(applications.map((application) => [application.uid, application]));

  // Whoever has not picked, first. That is the reason this screen is being looked at.
  const ordered = [...managers].sort((first, second) => {
    const waiting = Number(submitted.has(first.uid)) - Number(submitted.has(second.uid));
    return waiting !== 0 ? waiting : first.teamName.localeCompare(second.teamName);
  });

  const missing = ordered.filter((manager) => !submitted.has(manager.uid));
  const texts = missing
    .map((manager) => detail.get(manager.uid)?.phone)
    .filter((phone): phone is string => Boolean(phone))
    .map(dialable);

  return (
    <div className="card">
      <div className="confhead">
        Contact details
        <span className="colhead">you only</span>
      </div>

      {ordered.map((manager) => {
        const found = detail.get(manager.uid);
        const phone = found?.phone ?? '';
        const email = found?.email ?? '';
        return (
          <div className="row" key={manager.uid}>
            {manager.logo ? <img className="badge" src={manager.logo} alt="" /> : <span className="badge empty" />}
            <span className="rowmain">
              <span className="rowname">
                {manager.teamName}
                {!submitted.has(manager.uid) && <span className="tag">not picked</span>}
              </span>
              <span className="rowmeta">
                {found?.name || manager.name}
              </span>
              <span className="contactlinks">
                {phone
                  ? <a href={`sms:${dialable(phone)}`}>{formatPhone(phone)}</a>
                  : <span className="nocontact">no number</span>}
                {email
                  ? <a href={`mailto:${email}`}>{email}</a>
                  : <span className="nocontact">no email yet</span>}
              </span>
            </span>
          </div>
        );
      })}

      {texts.length > 1 && (
        <div className="pending">
          <a href={`sms:${texts.join(',')}`}>
            Text all {texts.length} who have not picked {round}
          </a>
        </div>
      )}

      <div className="pending">
        An email appears the next time somebody opens the app, so anybody who joined earlier will
        fill in on his own. A number only ever comes from the join form.
      </div>
    </div>
  );
}
