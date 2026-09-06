import { useCallback, useEffect, useState } from 'react';
import { admitManager, declineApplication, readApplications, readContest, readEntries, readSubmitted, removeManager, setCommissioners } from './store/firestore.ts';
import type { Application, Contest, Manager } from './store/firestore.ts';
import { dialable, formatPhone } from './domain/phone.ts';
import { Advance } from './Advance.tsx';
import { Pool } from './Pool.tsx';
import { RosterBuilder } from './RosterBuilder.tsx';
import { Corrections } from './Corrections.tsx';
import { Seeding } from './Seeding.tsx';

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
  const [confirming, setConfirming] = useState<string | null>(null);
  // Whose team the commissioner is currently fixing, if any.
  const [editing, setEditing] = useState<Manager | null>(null);
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

  async function act(uid: string, work: () => Promise<void>) {
    setBusy(uid);
    setProblem(null);
    try {
      await work();
      await load();
    } catch (cause) {
      setProblem((cause as Error).message);
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  if (problem) return <div className="card gate"><p className="problem">{problem}</p></div>;
  if (!contest) return <div className="card gate"><p>Loading…</p></div>;

  const round = contest.rounds[contest.currentRound];
  const commissioners = contest.commissioners ?? [];
  // Whoever set the contest up. The rules refuse any update that drops him, so this only decides
  // what the screen offers.
  const owner = commissioners[0];
  const missing = managers.filter((manager) => !submitted.has(manager.uid));

  // While fixing somebody's team, that is the whole screen — no room to press the wrong thing.
  if (editing) {
    return (
      <>
        <button className="ghost wide back" onClick={() => { setEditing(null); void load(); }}>
          ← Done with {editing.teamName}
        </button>
        <RosterBuilder
          uid={editing.uid}
          onBehalfOf={{ name: editing.teamName }}
          onDone={() => { setEditing(null); void load(); }}
        />
      </>
    );
  }

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
              <span className="actions">
                <button
                  className="submit small"
                  disabled={busy === application.uid}
                  onClick={() => void act(application.uid, () => admitManager(CONTEST, application))}
                >
                  {busy === application.uid ? '…' : 'Let in'}
                </button>
                <button
                  className="danger small"
                  disabled={busy === application.uid}
                  onClick={() =>
                    confirming === application.uid
                      ? void act(application.uid, () => declineApplication(CONTEST, application.uid))
                      : setConfirming(application.uid)
                  }
                >
                  {confirming === application.uid ? 'Sure?' : 'No'}
                </button>
              </span>
            </div>
          ))
        )}
      </div>

      <Pool contest={contest} managers={managers} commissioner onChange={() => void load()} />

      <Advance contest={contest} onDone={() => void load()} />

      <Seeding
        contest={contest}
        locked={(contest.locks[String(contest.currentRound)] ?? new Date()) <= new Date()}
        onChange={() => void load()}
      />

      <Corrections contest={contest} by={uid} />

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
            <span className="actions">
              <span className={submitted.has(manager.uid) ? 'keeps' : 'resets'}>
                {submitted.has(manager.uid) ? 'in' : 'not yet'}
              </span>
              <button className="ghost small" onClick={() => setEditing(manager)}>Team</button>
              {manager.uid === owner ? (
                <span className="tag">owner</span>
              ) : (
                <button
                  className={commissioners.includes(manager.uid) ? 'submit small' : 'ghost small'}
                  disabled={busy === manager.uid}
                  onClick={() =>
                    void act(manager.uid, () =>
                      setCommissioners(
                        CONTEST,
                        commissioners.includes(manager.uid)
                          ? commissioners.filter((id) => id !== manager.uid)
                          : [...commissioners, manager.uid],
                      ),
                    )
                  }
                >
                  {commissioners.includes(manager.uid) ? 'Commish' : 'Make commish'}
                </button>
              )}
              {manager.uid !== uid && (
                <button
                  className="danger small"
                  disabled={busy === manager.uid}
                  onClick={() =>
                    confirming === manager.uid
                      ? void act(manager.uid, () => removeManager(CONTEST, manager.uid))
                      : setConfirming(manager.uid)
                  }
                >
                  {busy === manager.uid ? '…' : confirming === manager.uid ? 'Really remove?' : 'Remove'}
                </button>
              )}
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
