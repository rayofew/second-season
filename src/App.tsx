import { useEffect, useState } from 'react';
import { RosterBuilder } from './RosterBuilder.tsx';
import { Bracket } from './Bracket.tsx';
import { Standings } from './Standings.tsx';
import { Rules } from './Rules.tsx';
import { Register } from './Register.tsx';
import { SignIn, SignOut, useUser } from './Auth.tsx';
import { readContest, readEntries } from './store/firestore.ts';
import type { Contest } from './store/firestore.ts';

const CONTEST = 'rehearsal-2026';

type Tab = 'team' | 'bracket' | 'standings' | 'rules';

export function App() {
  const [tab, setTab] = useState<Tab>('team');
  const { user, checking } = useUser();
  const [contest, setContest] = useState<Contest | null>(null);
  const [managers, setManagers] = useState(0);
  // null while we find out; false means signed in but not in this league.
  const [member, setMember] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        setContest(await readContest(CONTEST));
        setManagers((await readEntries(CONTEST)).length);
        setMember(true);
      } catch (cause) {
        // The rules refuse anyone without an entry, which is how we learn they are not in yet.
        setMember((cause as { code?: string }).code === 'permission-denied' ? false : true);
      }
    })();
  }, [user]);

  return (
    <div className="wrap">
      <header>
        <div className="topline">
          <div className="brand">
            <img src="/crest-96.png" alt="" width="40" height="40" />
            <h1>Second Season</h1>
          </div>
          {user && <SignOut user={user} />}
        </div>
        <p>
          {contest
            ? `${contest.name} · ${contest.season} · ${managers} manager${managers === 1 ? '' : 's'}`
            : 'A private playoff contest'}
        </p>
      </header>

      {checking ? null : !user ? (
        <SignIn />
      ) : member === false ? (
        <Register user={user} />
      ) : (
        <>
          <nav>
            <button aria-current={tab === 'team'} onClick={() => setTab('team')}>My Team</button>
            <button aria-current={tab === 'bracket'} onClick={() => setTab('bracket')}>Bracket</button>
            <button aria-current={tab === 'standings'} onClick={() => setTab('standings')}>Standings</button>
            <button aria-current={tab === 'rules'} onClick={() => setTab('rules')}>Rules</button>
          </nav>

          {tab === 'team' ? <RosterBuilder uid={user.uid} />
            : tab === 'bracket' ? <Bracket />
            : tab === 'rules' ? <Rules />
            : <Standings uid={user.uid} />}
        </>
      )}
    </div>
  );
}
