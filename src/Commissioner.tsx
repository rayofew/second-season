import { useCallback, useEffect, useState } from 'react';
import { explain } from './domain/trouble.ts';
import { admitManager, declineApplication, readApplications, readContest, readEntries, readStandIns, readSubmitted, removeManager, setCommissioners, setPaid, syncTeamLabels } from './store/firestore.ts';
import type { Application, Contest, Manager, StandInRegister } from './store/firestore.ts';
import { dialable, formatPhone } from './domain/phone.ts';
import { Advance } from './Advance.tsx';
import { Pool } from './Pool.tsx';
import { RosterBuilder } from './RosterBuilder.tsx';
import { Corrections } from './Corrections.tsx';
import { Managers } from './Managers.tsx';
import { StandIns } from './StandIns.tsx';
import { KickoffSetting } from './KickoffSetting.tsx';
import { Calculator } from './Calculator.tsx';
import { GamesPanel } from './GamesPanel.tsx';
import { Moves } from './Moves.tsx';
import { Rules } from './Rules.tsx';

/**
 * Commish in sections rather than one long page.
 *
 * Ray: "in the commish tab, I want sub tabs to better manage settings like a player tab, log tab
 * money tab rules tab". Everything that was here still is, grouped by what you came to do. Which
 * section was open is remembered on this device, so a reload does not throw you back to the top.
 */
type Section = 'players' | 'money' | 'rounds' | 'log' | 'rules' | 'games';
const SECTIONS: { id: Section; label: string; owner?: boolean }[] = [
  { id: 'players', label: 'Players' },
  { id: 'money', label: 'Money' },
  { id: 'rounds', label: 'Rounds' },
  { id: 'log', label: 'Log' },
  { id: 'rules', label: 'Rules' },
  { id: 'games', label: 'Games', owner: true },
];
const SAVED = 'commish-section';
const remembered = (): Section => {
  try {
    const saved = localStorage.getItem(SAVED) as Section | null;
    return saved && SECTIONS.some((each) => each.id === saved) ? saved : 'players';
  } catch {
    return 'players';
  }
};
import { useGame } from './game.tsx';

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


export function Commissioner({ uid }: { uid: string }) {
  const CONTEST = useGame();
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
  const [section, setSection] = useState<Section>(remembered);
  const show = (next: Section) => {
    setSection(next);
    try { localStorage.setItem(SAVED, next); } catch { /* a private window keeps nothing, which is fine */ }
  };

  const load = useCallback(async () => {
    try {
      const found = await readContest(CONTEST);
      if (!found) return;
      setContest(found);
      const [people, waiting] = await Promise.all([readEntries(CONTEST), readApplications(CONTEST)]);
      const members = new Set(people.map((person) => person.uid));
      setManagers(people);
      // After every admission, removal or rename this screen reloads, so the public team list
      // catches up here as well as on the commissioner's next visit.
      void syncTeamLabels(CONTEST, people).catch(() => undefined);
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

  const isOwner = owner === uid;
  const offered = SECTIONS.filter((each) => !each.owner || isOwner);
  const showing = offered.some((each) => each.id === section) ? section : 'players';

  return (
    <>
      <nav className="subnav" aria-label="Commish sections">
        {offered.map((each) => (
          <button key={each.id} aria-current={showing === each.id} onClick={() => show(each.id)}>
            {each.label}
            {each.id === 'players' && applications.length > 0 && <span className="tabcount">{applications.length}</span>}
          </button>
        ))}
      </nav>

      {showing === 'players' && <>
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

      <Managers
        managers={managers}
        applications={everyone}
        filled={filled}
        round={round?.name ?? 'This round'}
        standIns={standIns}
        uid={uid}
        owner={owner}
        commissioners={commissioners}
        buyIn={contest.prizes?.buyIn ?? 0}
        busy={busy}
        confirming={confirming}
        onConfirm={setConfirming}
        onEdit={setEditing}
        onCommish={(manager) =>
          void act(manager.uid, () =>
            setCommissioners(
              CONTEST,
              commissioners.includes(manager.uid)
                ? commissioners.filter((id) => id !== manager.uid)
                : [...commissioners, manager.uid],
            ),
          )
        }
        onRemove={(manager) =>
          void act(manager.uid, () => removeManager(CONTEST, manager.uid, contest.rounds.length))
        }
        onPaid={(manager) => void act(manager.uid, () => setPaid(CONTEST, manager.uid, !manager.paid))}
      />

      {/* The bench. It lived on a Lab tab that existed to preview layouts against live football,
          which the design preview at ?preview now covers without a tab of its own. */}
      <StandIns />
      </>}

      {showing === 'money' && <>
        <Pool contest={contest} managers={managers} commissioner onChange={() => void load()} />
        <Calculator contest={contest} paid={managers.filter((manager) => manager.paid).length} onDone={() => void load()} />
      </>}

      {showing === 'rounds' && <>
        <Advance contest={contest} onDone={() => void load()} />
        <Corrections contest={contest} by={uid} />
      </>}

      {/* Every move, the round being played included — a commissioner may read what nobody else can
          until the lock. The same screen as the Moves tab, which says as much at the top. */}
      {showing === 'log' && <Moves />}

      {showing === 'rules' && <>
        <KickoffSetting contest={contest} onDone={() => void load()} />
        <div className="pending subnote">
          Below is the Rules page exactly as players see it. The money section is written by the calculator
          on the Money tab, and the schedule by each round&apos;s lock.
        </div>
        <Rules />
      </>}

      {showing === 'games' && isOwner && <GamesPanel uid={uid} onChange={() => void load()} />}
    </>
  );
}
