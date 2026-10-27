import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, db } from './firebase.ts';
import { isUsPhone, typingPhone } from './domain/phone.ts';
import { shortName, splitName } from './domain/name.ts';
import { explain } from './domain/trouble.ts';
import { joinGame, leaveGame, readProfile, readStanding, saveProfile } from './store/firestore.ts';
import type { Game, Profile } from './store/firestore.ts';
import { REHEARSAL } from './game.tsx';
import { shrink } from './Register.tsx';

/**
 * The step before anything else, whenever there is a game to sign up for.
 *
 * Ray: "at sign up or log in (when playoffs approach) any information required, ie choosing the
 * league/updating your number happens first." So a person who signs in while any game is open is
 * shown this once: which games they want in, and their details — the phone number required,
 * because payouts are settled by phone. Anybody who has played before finds it filled in already
 * and only has to confirm it. It can be opened again from "My games" until each game's first lock,
 * to join another or take a request back.
 *
 * One profile for every game (Ray: the same team name everywhere). Joining copies it onto that game's
 * application, and the commissioner lets people in by hand, exactly as before.
 */

type Standing = 'in' | 'waiting' | 'out';

export function MyGames({ user, open, onDone, onCancel }: {
  user: User;
  /** The games taking sign-ups right now. */
  open: Game[];
  onDone: () => void;
  /** Only offered when this was opened from "My games", not when it is the step before the app. */
  onCancel?: () => void;
}) {
  const given = splitName(user.displayName ?? '');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [standing, setStanding] = useState<Record<string, Standing>>({});
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const saved = await readProfile(user.uid);
      /*
       * Nobody has a profile before this screen existed, so the first time it is filled from whatever
       * they told the rehearsal when they applied for it — name, team, phone, badge — and failing
       * that from the account. Their own application is theirs to read.
       */
      let start: Profile | null = saved;
      if (!start) {
        const old = await getDoc(doc(db, 'contests', REHEARSAL, 'applications', user.uid)).catch(() => null);
        const data = old?.exists() ? old.data() : null;
        start = {
          firstName: data?.firstName ?? given.first,
          lastName: data?.lastName ?? given.last,
          teamName: data?.teamName ?? '',
          logo: data?.logo ?? '',
          phone: data?.phone ?? '',
          email: user.email ?? '',
          seen: [],
        };
      }
      const states = Object.fromEntries(await Promise.all(open.map(async (game) => [game.id, await readStanding(game.id, user.uid)] as const)));
      setStanding(states);
      setChosen(Object.fromEntries(open.map((game) => [game.id, states[game.id] !== 'out'])));
      setProfile({ ...start, email: start.email || user.email || '' });
    })().catch((cause) => setProblem(explain(cause)));
  }, [user.uid, open.map((game) => game.id).join(',')]);

  if (!profile) return <div className="card gate"><p>{problem ?? 'Loading…'}</p></div>;
  const set = (change: Partial<Profile>) => setProfile({ ...profile, ...change });

  async function save() {
    if (!profile) return;
    if (!profile.firstName.trim()) { setProblem('A first name, at least.'); return; }
    if (!isUsPhone(profile.phone)) {
      setProblem('A phone number, please: ten digits, area code first. Only the commissioner sees it, for sorting out payouts.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const seen = [...new Set([...profile.seen, ...open.map((game) => game.id)])];
      const next = { ...profile, firstName: profile.firstName.trim(), lastName: profile.lastName.trim(), teamName: profile.teamName.trim(), seen };
      await saveProfile(user.uid, next);
      for (const game of open) {
        const was = standing[game.id] ?? 'out';
        // Ticked and not yet asked: ask. Ticked and already waiting: ask again, so a new number reaches
        // the application. Unticked and only waiting: take the request back. Already in: their call is
        // the commissioner's now, and the box cannot be unticked.
        if (chosen[game.id] && was !== 'in') await joinGame(game.id, user.uid, next);
        if (!chosen[game.id] && was === 'waiting') await leaveGame(game.id, user.uid);
      }
      onDone();
    } catch (cause) {
      setProblem(explain(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card prose register">
      <h2>{onCancel ? 'My games' : 'Before you start'}</h2>
      <p>Pick the games you want to play, and check your details. You can change your games until each one locks.</p>

      <div className="gamepicks">
        {open.map((game) => {
          const now = standing[game.id] ?? 'out';
          return (
            <label className="gamepick" key={game.id}>
              <input
                type="checkbox" checked={Boolean(chosen[game.id])} disabled={now === 'in' || busy}
                onChange={(event) => setChosen({ ...chosen, [game.id]: event.target.checked })}
              />
              <span>
                <strong>{game.name}</strong>
                <span className="rowmeta">
                  {now === 'in' ? 'You are in.' : now === 'waiting' ? 'Waiting for the commissioner to let you in.' : 'Not joined yet.'}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <p className="whoami">
        Signed in as <strong>{user.email}</strong>.{' '}
        <button className="linky inline" onClick={() => void signOut(auth)}>Not you?</button>
      </p>

      <div className="splitrow">
        <label>
          <span>First name</span>
          <input value={profile.firstName} autoComplete="given-name" onChange={(event) => set({ firstName: event.target.value })} />
        </label>
        <label>
          <span>Last name</span>
          <input value={profile.lastName} autoComplete="family-name" onChange={(event) => set({ lastName: event.target.value })} />
        </label>
      </div>

      <label>
        <span>Team name <em>the same in every game</em></span>
        <input
          value={profile.teamName}
          onChange={(event) => set({ teamName: event.target.value })}
          placeholder={shortName(profile.firstName, profile.lastName) || 'Defaults to your name'}
        />
      </label>

      <label>
        <span>Phone <em>required · only the commissioner sees it, for payouts</em></span>
        <input
          type="tel" value={profile.phone} placeholder="(425) 471-4580"
          onChange={(event) => set({ phone: typingPhone(event.target.value) })}
        />
      </label>

      <label className="badgepick">
        <span>Team badge <em>optional</em></span>
        <div className="badgerow">
          {profile.logo ? <img className="badge" src={profile.logo} alt="" /> : <span className="badge empty" />}
          <input
            type="file" accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void shrink(file).then((logo) => set({ logo })).catch(() => setProblem('That image could not be read. A JPEG or PNG works best.'));
            }}
          />
        </div>
      </label>

      {problem && <p className="problem">{problem}</p>}

      <div className="summary">
        {onCancel && <button className="ghost" disabled={busy} onClick={onCancel}>Cancel</button>}
        <button className="submit" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save and continue'}</button>
      </div>
    </div>
  );
}

/** Whether somebody needs the step before anything else: a game they have not been asked about, or no phone. */
export async function needsMyGames(uid: string, open: Game[]): Promise<boolean> {
  if (open.length === 0) return false;
  const profile = await readProfile(uid);
  if (!profile || !isUsPhone(profile.phone)) return true;
  return open.some((game) => !profile.seen.includes(game.id));
}
