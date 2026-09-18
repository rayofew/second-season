import { useCallback, useEffect, useState } from 'react';
import { explain } from './domain/trouble.ts';
import { admitManager, declineApplication, readApplications, readContest, readEntries, readStandIns, readSubmitted, removeManager, setCommissioners } from './store/firestore.ts';
import type { Application, Contest, Manager, StandInRegister } from './store/firestore.ts';
import { dialable, formatPhone } from './domain/phone.ts';
import { Advance } from './Advance.tsx';
import { Pool } from './Pool.tsx';
import { RosterBuilder } from './RosterBuilder.tsx';
import { Corrections } from './Corrections.tsx';
import { Contacts } from './Contacts.tsx';
import { Log } from './Log.tsx';

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
  // Every application ever written, including admitted managers — where phone and email live.
  const [everyone, setEveryone] = useState<Application[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  /** Slots filled, by manager. Nine is ready; anything less is somebody to chase. */
  const [filled, setFilled] = useState<Map<string, number>>(new Map());
  // Which of these managers are invented. Read from the commissioner's own document, because
  // nothing readable by the league is allowed to say so.
  const [standIns, setStandIns] = useState<StandInRegister>({});
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
      setEveryone(waiting);
      setApplications(waiting.filter((application) => !members.has(application.uid)));
      setFilled(await readSubmitted(CONTEST, people.map((person) => person.uid), found.currentRound));
      setStandIns(await readStandIns(CONTEST).catch(() => ({})));
    } catch (cause) {
      setProblem(explain(cause));
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
      setProblem(explain(cause));
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

      <Contacts
        managers={managers}
        applications={everyone}
        filled={filled}
        round={round?.name ?? 'This round'}
      />

      <Log managers={managers} standIns={standIns} uid={uid} />

      <Pool contest={contest} managers={managers} commissioner onChange={() => void load()} />

      <Advance contest={contest} onDone={() => void load()} />

      <Corrections contest={contest} by={uid} />

      <div className="card">
        <div className="confhead">
          Managers
          <span className="colhead">{managers.length}</span>
        </div>
        {managers.map((manager) => (
          <div className="row" key={manager.uid}>
            {manager.logo ? <img className="badge" src={manager.logo} alt="" /> : <span className="badge empty" />}
            <span className="rowmain">
              <span className="rowname">{manager.teamName}</span>
              <span className="rowmeta">
                {manager.name}
                {manager.uid === uid && <><span className="dot">·</span>you</>}
                {standIns[manager.uid] && <span className="tag">stand-in</span>}
              </span>
            </span>
            <span className="actions">

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
                      ? void act(manager.uid, () => removeManager(CONTEST, manager.uid, contest.rounds.length))
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


    </>
  );
}
