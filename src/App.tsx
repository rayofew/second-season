import { useEffect, useState } from 'react';
import { RosterBuilder } from './RosterBuilder.tsx';
import { Bracket } from './Bracket.tsx';
import { Standings } from './Standings.tsx';
import { Rules } from './Rules.tsx';
import { Register } from './Register.tsx';
import { Commissioner } from './Commissioner.tsx';
import { Lab } from './Lab.tsx';
import { Moves } from './Moves.tsx';
import { Version } from './Version.tsx';
import { Home } from './Home.tsx';
import { Theme } from './Theme.tsx';
import { SignIn, SignOut, useUser } from './Auth.tsx';
import { readContest, readEntries } from './store/firestore.ts';
import type { Contest } from './store/firestore.ts';
import { isRefusal } from './domain/trouble.ts';

const CONTEST = 'rehearsal-2026';

type Tab = 'home' | 'team' | 'bracket' | 'standings' | 'moves' | 'rules' | 'commish' | 'lab';

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  const { user, checking } = useUser();
  const [contest, setContest] = useState<Contest | null>(null);
  const [managers, setManagers] = useState(0);
  // null while we find out; false means signed in but not in this league.
  const [member, setMember] = useState<boolean | null>(null);
  // Hiding the tab is courtesy. What a commissioner may actually do is decided by the rules.
  const commissioner = Boolean(user && contest?.commissioners?.includes(user.uid));

  /**
   * Who is signed in, and whether the league knows them.
   *
   * Everything is cleared first, because signing out and back in as somebody else happens in the
   * same tab and React keeps state that React was not told to forget. Worse, Firestore keeps the
   * previous account's documents in memory, so the reads below can answer from a cache filled by
   * a manager who is no longer signed in — which is how a removed account once got a full tab bar
   * over a screen that then refused to load anything.
   */
  useEffect(() => {
    setMember(null);
    setContest(null);
    setManagers(0);
    setTab('home');
    if (!user) return;

    let current = true;
    void (async () => {
      try {
        const found = await readContest(CONTEST);
        const people = await readEntries(CONTEST);
        if (!current) return;
        setContest(found);
        setManagers(people.length);
        setMember(true);
      } catch (cause) {
        // The rules refuse anyone without an entry, which is how we learn they are not in yet.
        if (current) setMember(isRefusal(cause) ? false : true);
      }
    })();
    return () => { current = false; };
  }, [user?.uid]);

  return (
    <div className="wrap">
      <Version />
      <header>
        <div className="topline">
          <div className="brand">
            <img src="/crest-96.png" alt="" width="56" height="56" />
            <h1>Second Season</h1>
          </div>
          <span className="headerside">
            <Theme />
            {user && <SignOut user={user} />}
          </span>
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
            <button aria-current={tab === 'home'} onClick={() => setTab('home')}>Home</button>
            <button aria-current={tab === 'team'} onClick={() => setTab('team')}>My Team</button>
            <button aria-current={tab === 'bracket'} onClick={() => setTab('bracket')}>Bracket</button>
            <button aria-current={tab === 'standings'} onClick={() => setTab('standings')}>Standings</button>
            <button aria-current={tab === 'moves'} onClick={() => setTab('moves')}>Moves</button>
            <button aria-current={tab === 'rules'} onClick={() => setTab('rules')}>Rules</button>
            {commissioner && (
              <>
                <button aria-current={tab === 'commish'} onClick={() => setTab('commish')}>Commish</button>
                <button aria-current={tab === 'lab'} onClick={() => setTab('lab')}>Lab</button>
              </>
            )}
          </nav>

          {tab === 'home' ? <Home uid={user.uid} onGoToTeam={() => setTab('team')} />
            : tab === 'team' ? <RosterBuilder uid={user.uid} />
            : tab === 'bracket' ? <Bracket />
            : tab === 'moves' ? <Moves />
            : tab === 'rules' ? <Rules />
            : tab === 'commish' && commissioner ? <Commissioner uid={user.uid} />
            : tab === 'lab' && commissioner ? <Lab />
            : <Standings uid={user.uid} />}
        </>
      )}
    </div>
  );
}
