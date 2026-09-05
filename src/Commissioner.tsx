import { useCallback, useEffect, useState } from 'react';
import { admitManager, readApplications, readContest, readEntries, readSubmitted } from './store/firestore.ts';
import type { Application, Contest, Manager } from './store/firestore.ts';
import { dialable, formatPhone } from './domain/phone.ts';

/**
 * The commissioner's tab: who wants in, and who has not picked yet.
 *
 * Both exist as scripts, and the scripts are still the honest way to do anything complicated. This
 * is here because the commissioner will not have a terminal at four o'clock on a Thursday, which is
 * exactly when somebody registers or somebody else has forgotten to submit.
 *
 * Changing the rules is deliberately not here. It happens about twice, and a mistyped scoring value
 * quietly changes what everybody scored with nothing on screen to say so — a lot of dangerous
 * surface for something a script and a deploy handle safely.
 *
 * Nothing here is a privilege this screen grants. The security rules decide what a commissioner may
 * do; hiding the tab from everyone else is only courtesy.
 */

const CONTEST = 'rehearsal-2026';

export function Commissioner({ uid }: { uid: string }) {
  const [contest, setContest] = useState<Contest | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const found = await readContest(CONTEST);
      if (!found) return;
      setContest(found);
      const [people, waiting] = await Promise.all([readEntries(CONTEST), readApplications(CONTEST)]);
      const members = new Set(people.map((person) => person.uid));
      setManagers(people);
      setApplications(waiting.filter((application) => !members.has(application.uid)));
      setSubmitted(await readSubmitted(CONTEST, people.map((person) => person.uid), found.currentRound));
    } catch (cause) {
      setProblem((cause as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function admit(application: Application) {
    setBusy(application.uid);
    setProblem(null);
    try {
      await admitManager(CONTEST, application);
      await load();
    } catch (cause) {
      setProblem((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (problem) return <div className="card gate"><p className="problem">{problem}</p></div>;
  if (!contest) return <div className="card gate"><p>Loading…</p></div>;

  const round = contest.rounds[contest.currentRound];
  const missing = managers.filter((manager) => !submitted.has(manager.uid));

  return (
    <>
      <div className="card">
        <div className="confhead">Waiting to be let in ({applications.length})</div>
        {applications.length === 0 ? (
          <div className="pending">Nobody is waiting.</div>
        ) : (
          applications.map((application) => (
            <div className="row" key={application.uid}>
              {application.logo
                ? <img className="badge" src={application.logo} alt="" />
                : <span className="badge empty" />}
              <span className="rowmain">
                <span className="rowname">{application.teamName}</span>
                <span className="rowmeta">
                  {application.name}
                  {application.phone && <><span className="dot">·</span>
                    <a href={`sms:${dialable(application.phone)}`}>{formatPhone(application.phone)}</a></>}
                </span>
              </span>
              <button className="submit small" disabled={busy === application.uid} onClick={() => void admit(application)}>
                {busy === application.uid ? 'Letting in…' : 'Let in'}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="confhead">
          {round?.name} — {submitted.size} of {managers.length} submitted
        </div>
        {managers.map((manager) => (
          <div className="row" key={manager.uid}>
            {manager.logo ? <img className="badge" src={manager.logo} alt="" /> : <span className="badge empty" />}
            <span className="rowmain">
              <span className="rowname">{manager.teamName}</span>
              <span className="rowmeta">
                {manager.name}
                {manager.uid === uid && <><span className="dot">·</span>you</>}
              </span>
            </span>
            <span className={submitted.has(manager.uid) ? 'keeps' : 'resets'}>
              {submitted.has(manager.uid) ? 'in' : 'not yet'}
            </span>
          </div>
        ))}
      </div>

      {missing.length > 0 && (
        <p className="footnote">
          Still to pick: {missing.map((manager) => manager.name).join(', ')}. Their phone numbers are
          on the applications, which only you can read.
        </p>
      )}
    </>
  );
}
