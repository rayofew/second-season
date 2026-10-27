import { useCallback, useEffect, useRef, useState } from 'react';
import { RosterBuilder } from './RosterBuilder.tsx';
import { Bracket } from './Bracket.tsx';
import { Standings } from './Standings.tsx';
import { Live } from './Live.tsx';
import { Rules } from './Rules.tsx';
import { Commissioner } from './Commissioner.tsx';
import { Moves } from './Moves.tsx';
import { Board } from './Board.tsx';
import { Version } from './Version.tsx';
import { Home } from './Home.tsx';
import { Theme } from './Theme.tsx';
import { SignIn, SignOut, useUser } from './Auth.tsx';
import { FALLBACK_GAMES, buildLineups, noteVisit, readContest, readEntries, readGames, readLeague, readMine, readPosts, readTeamLabels, rememberEmail, syncTeamLabels } from './store/firestore.ts';
import type { Game } from './store/firestore.ts';
import { GameProvider, OWNER_UID, REHEARSAL, rememberGame, rememberedGame, useGame } from './game.tsx';
import { MyGames, needsMyGames } from './MyGames.tsx';
import { NextSeason } from './NextSeason.tsx';
import { Results } from './Results.tsx';
import type { Contest } from './store/firestore.ts';
import { isRefusal } from './domain/trouble.ts';
import { hashFor, tabFromHash } from './domain/tabs.ts';
import type { Tab } from './domain/tabs.ts';

export function App() {
  // Whatever the address says, so a link to a tab opens that tab.
  const [tab, setTab] = useState<Tab>(() => tabFromHash(window.location.hash));
  /** Who was signed in last time this ran, to tell a swap from the first answer. */
  const was = useRef<string | null>(null);
  /**
   * Whether the lineup has changes nobody has sent.
   *
   * A ref rather than state: it is read at the moment somebody tries to leave and never drawn, so
   * re-rendering the whole app every time a man is swapped would be work for nothing.
   */
  const unsaved = useRef(false);
  /** Stable, so the builder is not told again on every render of everything above it. */
  const noteUnsaved = useCallback((pending: boolean) => { unsaved.current = pending; }, []);
  const { user, checking } = useUser();
  const [contest, setContest] = useState<Contest | null>(null);
  const [managers, setManagers] = useState(0);
  // null while we find out; false means signed in but not in this league.
  const [member, setMember] = useState<boolean | null>(null);
  /**
   * Messages said since this manager last looked, counted on the tab.
   *
   * On the tab rather than only on Home, because Home is one screen out of nine and somebody who
   * lands on his team and goes straight to picking never sees it. A number next to the word Board
   * is visible from wherever he happens to be.
   */
  const [unread, setUnread] = useState(0);
  /**
   * Stable, because the Board reloads whenever this changes identity.
   *
   * An arrow written at the call site is a new function on every render, and the Board's loader
   * depends on it — which is a fetch per render and then a render per fetch.
   */
  const clearUnread = useCallback(() => setUnread(0), []);
  /** A visitor who has asked to sign in, which swaps the open pages for the sign-in screen. */
  const [signingIn, setSigningIn] = useState(false);

  /**
   * The games, and which one is on screen.
   *
   * Every page below reads the chosen game through useGame(), and the whole of it is keyed on that
   * id, so switching remounts everything rather than drawing one game's numbers under another's
   * name. Players see the games that are switched on; the owner sees them all.
   */
  const [games, setGames] = useState<Game[]>(FALLBACK_GAMES);
  const [game, setGame] = useState<string>(rememberedGame);
  const CONTEST = game;
  /** Games taking sign-ups now: switched on, and before their first lock. */
  const [open, setOpen] = useState<Game[]>([]);
  /** Whether the step before anything else is showing — needed, or asked for from "My games". */
  const [askGames, setAskGames] = useState<'needed' | 'asked' | null>(null);
  const [recheck, setRecheck] = useState(0);
  const visible = games.filter((each) => each.enabled || user?.uid === OWNER_UID);

  useEffect(() => { void readGames().then(setGames); }, []);
  // A remembered game that has since been switched off or removed falls back to the first one shown.
  useEffect(() => {
    if (visible.length > 0 && !visible.some((each) => each.id === game)) setGame(visible[0]!.id);
  }, [games, user?.uid]);
  const pick = (id: string) => {
    if (!mayLeave(tabFromHash(window.location.hash), 'home')) return;
    rememberGame(id);
    setGame(id);
  };

  // Which games are open for sign-ups: each one's first lock, read once the list is known.
  useEffect(() => {
    let current = true;
    void (async () => {
      const now = new Date();
      const checked = await Promise.all(games.filter((each) => each.enabled).map(async (each) => {
        const found = await readContest(each.id).catch(() => null);
        const lock = found?.locks?.['0'];
        return found && (!lock || lock > now) ? each : null;
      }));
      if (current) setOpen(checked.filter((each): each is Game => each !== null));
    })();
    return () => { current = false; };
  }, [games]);

  // And whether this person still has to answer: a game they have not been asked about, or no phone.
  useEffect(() => {
    if (!user || open.length === 0) { setAskGames(null); return; }
    let current = true;
    void needsMyGames(user.uid, open).then((needed) => { if (current) setAskGames((was) => (was === 'asked' ? was : needed ? 'needed' : null)); });
    return () => { current = false; };
  }, [user?.uid, open, recheck]);

  /**
   * Going somewhere, in a way the browser can undo.
   *
   * A history entry per tab, so back walks them. Back from the first one leaves the app, which is
   * right — that is where somebody came in, and on a phone it is usually a text message.
   */
  /**
   * Whether it is all right to go.
   *
   * Asked before every way out of the lineup — a tab, the back button, closing the window — because
   * the one thing worse than picking a team is picking it twice.
   */
  const mayLeave = useCallback((from: Tab, to: Tab) => {
    if (from !== 'team' || to === 'team' || !unsaved.current) return true;
    return window.confirm(
      'Your lineup has changes you have not submitted.\n\n'
      + 'Leave without submitting? Nothing you changed will be saved.',
    );
  }, []);

  const go = useCallback((next: Tab) => {
    if (!mayLeave(tabFromHash(window.location.hash), next)) return;
    // Against the address rather than the previous state: a state updater is not the place for a
    // side effect, and React runs them twice in development to prove it.
    if (window.location.hash !== hashFor(next)) {
      window.history.pushState({ tab: next }, '', hashFor(next));
    }
    setTab(next);
  }, [mayLeave]);

  /**
   * Back and forward. The address is the only thing that knows where we are after one of these.
   *
   * Back has already happened by the time we hear about it, so refusing means going forward again
   * — which puts the address back where it was and leaves the lineup on screen.
   */
  useEffect(() => {
    const onPop = () => {
      const next = tabFromHash(window.location.hash);
      if (!mayLeave('team', next)) { window.history.forward(); return; }
      setTab(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [mayLeave]);

  /**
   * And closing the window, which the app cannot intercept — only object to.
   *
   * Browsers ignore the message and show their own words. Registered only while there is something
   * to lose, because a page that always argues about being closed is a page people stop reading.
   */
  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!unsaved.current) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);
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
    setUnread(0);

    /*
     * Home, but only when somebody has actually been swapped for somebody else.
     *
     * Doing it on every change of this effect would undo the address on the way in: the first run
     * happens before Firebase has said who is signed in, and forcing home there means a link to
     * #board opens on Home — which is most of the point of having the link.
     */
    if (was.current && was.current !== user?.uid) {
      setTab('home');
      window.history.replaceState({ tab: 'home' }, '', hashFor('home'));
    }
    was.current = user?.uid ?? null;
    setSigningIn(false);

    let current = true;
    /*
     * Nobody signed in: a visitor, who may read the contest and the public team list and nothing
     * else. Enough for the header and for the open pages, each of which fetches its own.
     */
    if (!user) {
      void (async () => {
        const [found, teams] = await Promise.all([
          readContest(CONTEST).catch(() => null),
          readTeamLabels(CONTEST).catch(() => []),
        ]);
        if (!current) return;
        setContest(found);
        setManagers(teams.length);
      })();
      return () => { current = false; };
    }

    void (async () => {
      try {
        const found = await readContest(CONTEST);
        // His own entry, which is also the membership test: the rules refuse it to anybody who has
        // none. One read, where reading the whole league to find out cost one per manager.
        const mine = await readMine(CONTEST, user.uid);
        // A commissioner may run the league without a team in it; the rules let him read entries
        // regardless, so a missing one only means "not a member" for everybody else.
        const commissioning = Boolean(found?.commissioners?.includes(user.uid));
        if (!mine && !commissioning) throw Object.assign(new Error('not a member'), { code: 'permission-denied' });
        const league = await readLeague(CONTEST);
        if (!current) return;
        setContest(found);
        setManagers(league.length);
        setMember(true);
        // So the commissioner can reach him. Written to the application, which only the two of
        // them can read, rather than to the entry, which the whole league can.
        void rememberEmail(CONTEST, user.uid, user.email).catch(() => undefined);
        // And a note that he was here, so the commissioner can see who has never opened it.
        void noteVisit(CONTEST, user.uid).catch(() => undefined);
        // The commissioner keeps the public team list in step with the entries, so a rename by any
        // route reaches visitors the next time he opens the app.
        //
        // He also keeps the one-document copy of each locked round's lineups, which is what spares
        // everybody else a read per manager on every page. A round that has just locked gets its copy
        // the first time he opens the app after kickoff; until then pages read the rosters one by one.
        if (found?.commissioners?.includes(user.uid)) {
          void (async () => {
            const people = await readEntries(CONTEST);
            await syncTeamLabels(CONTEST, people);
            const uids = people.map((person) => person.uid);
            const now = new Date();
            for (const round of found.rounds) {
              const lock = found.locks[String(round.round)];
              if (lock && lock <= now) await buildLineups(CONTEST, uids, round.round);
            }
          })().catch(() => undefined);
        }

        // His own posts are not news to him, which is the difference between a notice and a
        // receipt. Five is plenty: past that the number is "several" either way.
        const posts = await readPosts(CONTEST, 5).catch(() => []);
        const read = mine?.lastReadBoard;
        if (!current) return;
        setUnread(posts.filter((post) => post.uid !== user.uid && (!read || post.at > read)).length);
      } catch (cause) {
        // The rules refuse anyone without an entry, which is how we learn they are not in yet.
        if (current) setMember(isRefusal(cause) ? false : true);
      }
    })();
    return () => { current = false; };
  }, [user?.uid, game, recheck]);

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
            {visible.length > 1 && (
              <select className="gamepick-select" value={game} aria-label="Game" onChange={(event) => pick(event.target.value)}>
                {visible.map((each) => <option key={each.id} value={each.id}>{each.name}{each.enabled ? '' : ' (hidden)'}</option>)}
              </select>
            )}
            {user && open.length > 0 && askGames === null && (
              <button className="ghost small" onClick={() => setAskGames('asked')}>My games</button>
            )}
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

      <GameProvider value={game}>
      <div key={game}>
      {checking ? null : user && askGames ? (
        <MyGames
          user={user}
          open={open}
          onDone={() => { setAskGames(null); setRecheck((count) => count + 1); }}
          onCancel={askGames === 'asked' ? () => setAskGames(null) : undefined}
        />
      ) : !user && signingIn ? (
        <>
          <button className="ghost" onClick={() => setSigningIn(false)}>← Back to the pages</button>
          <SignIn />
        </>
      ) : !user ? (
        <Visitor tab={tab} go={go} contest={contest} onSignIn={() => setSigningIn(true)} />
      ) : member === false ? (
        // Signed in, but not in the game on screen: still waiting to be let in, or never joined.
        // They see what a visitor sees, and "My games" in the header whenever there is one to join.
        <>
          <div className="card notice">
            You are signed in, but not in {visible.find((each) => each.id === game)?.name ?? 'this game'}.
            {open.length > 0 ? ' Use My games, at the top, to join one or check where your request stands.' : ' Sign-ups open in December.'}
          </div>
          <Visitor tab={tab} go={go} contest={contest} />
        </>
      ) : (
        <>
          <nav>
            <button aria-current={tab === 'home'} onClick={() => go('home')}>Home</button>
            <button aria-current={tab === 'team'} onClick={() => go('team')}>My Team</button>
            <button aria-current={tab === 'live'} onClick={() => go('live')}>Live</button>
            <button aria-current={tab === 'bracket'} onClick={() => go('bracket')}>Bracket</button>
            <button aria-current={tab === 'standings'} onClick={() => go('standings')}>Standings</button>
            <button aria-current={tab === 'board'} onClick={() => go('board')}>
              Board
              {unread > 0 && <span className="tabcount">{unread}</span>}
            </button>
            <button aria-current={tab === 'moves'} onClick={() => go('moves')}>Moves</button>
            <button aria-current={tab === 'rules'} onClick={() => go('rules')}>Rules</button>
            {commissioner && (
              <button aria-current={tab === 'commish'} onClick={() => go('commish')}>Commish</button>
            )}
          </nav>

          {tab === 'home' ? (
            <Home
              uid={user.uid}
              onGoToTeam={() => go('team')}
              onGoToBoard={() => go('board')}
            />
          )
            : tab === 'team' ? (
              <RosterBuilder
                uid={user.uid}
                onUnsaved={noteUnsaved}
              />
            )
            : tab === 'live' ? <Live uid={user.uid} />
            : tab === 'bracket' ? <Bracket />
            : tab === 'board' ? (
              <Board uid={user.uid} commissioner={commissioner} onRead={clearUnread} />
            )
            : tab === 'moves' ? <Moves />
            : tab === 'rules' ? <Rules />
            : tab === 'commish' && commissioner ? <Commissioner uid={user.uid} />
            : <Standings uid={user.uid} />}
        </>
      )}
      </div>
      </GameProvider>
    </div>
  );
}

const noop = () => undefined;

/** The pages a visitor may open. Anything else in the address falls back to Home. */
const OPEN: readonly Tab[] = ['home', 'bracket', 'standings', 'board', 'rules'];

/**
 * The app for somebody who has not signed in.
 *
 * Ray: "I want people to be able to view the pages without signing in or creating an account, so
 * people can look before signing up in December." Five pages, read only, with team names in place
 * of real ones — the rules give a visitor nothing else, so this is the screen catching up with
 * what the database already allows rather than the screen deciding it.
 */
function Visitor({ tab, go, contest, onSignIn }: {
  tab: Tab;
  go: (next: Tab) => void;
  contest: Contest | null;
  /** Absent for somebody already signed in who is not in this game: there is nothing to sign in to. */
  onSignIn?: () => void;
}) {
  const CONTEST = useGame();
  const showing = OPEN.includes(tab) ? tab : 'home';
  return (
    <>
      <nav>
        <button aria-current={showing === 'home'} onClick={() => go('home')}>Home</button>
        <button aria-current={showing === 'bracket'} onClick={() => go('bracket')}>Bracket</button>
        <button aria-current={showing === 'standings'} onClick={() => go('standings')}>Standings</button>
        <button aria-current={showing === 'board'} onClick={() => go('board')}>Board</button>
        <button aria-current={showing === 'rules'} onClick={() => go('rules')}>Rules</button>
        {onSignIn && <button onClick={onSignIn}>Sign in</button>}
      </nav>

      {showing === 'bracket' ? <Bracket />
        : showing === 'standings' ? <Standings uid="" visitor />
        : showing === 'rules' ? <Rules />
        : showing === 'board' ? <Board uid="" commissioner={false} onRead={noop} onSignIn={onSignIn ?? noop} />
        : (
          <>
            <NextSeason contest={contest} onSignIn={onSignIn} />
            {contest?.status === 'final' ? (
              <>
                {CONTEST === REHEARSAL ? (
                  <h2 className="sectionhead">
                    How the rehearsal finished
                    <span>{contest.season}, played on the regular season to test everything before January</span>
                  </h2>
                ) : (
                  <h2 className="sectionhead">How {contest.name} finished</h2>
                )}
                <Results contestId={CONTEST} visitor />
              </>
            ) : contest && CONTEST === REHEARSAL ? (
              <div className="card prose">
                <p>
                  The rehearsal is being played now, on ordinary weeks of the regular season, to shake
                  everything out before January. The Bracket and Standings tabs show where it stands.
                </p>
              </div>
            ) : null}
          </>
        )}
    </>
  );
}
