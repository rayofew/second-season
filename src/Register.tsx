import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './firebase.ts';
import { typingPhone } from './domain/phone.ts';
import { ThemeChoice } from './Theme.tsx';

/**
 * Asking to join, which is not the same as being in.
 *
 * Signing in with Google proves who somebody is; it does not prove they were invited. So this
 * writes an application the commissioner has to act on, and a stranger who finds the link can knock
 * on the door and get no further.
 *
 * The badge is resized to 128px and stored as a data URL on the application itself. Cloud Storage
 * needs the paid plan on a new project, and a twelve kilobyte square in a document that allows a
 * megabyte is not worth a billing account.
 */

const CONTEST = 'rehearsal-2026';
const BADGE = 128;

/** Draws whatever they picked into a small square and hands back a data URL. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = BADGE;
  canvas.height = BADGE;
  const context = canvas.getContext('2d')!;
  // Cover rather than stretch: crop the long side instead of distorting a face or a crest.
  const side = Math.min(bitmap.width, bitmap.height);
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, BADGE, BADGE,
  );
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function Register({ user }: { user: User }) {
  const [name, setName] = useState(user.displayName ?? '');
  const [teamName, setTeamName] = useState('');
  const [phone, setPhone] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [state, setState] = useState<'form' | 'saving' | 'sent'>('form');
  const [problem, setProblem] = useState<string | null>(null);

  // Somebody who already applied should be told they are waiting, not asked again.
  useEffect(() => {
    void getDoc(doc(db, 'contests', CONTEST, 'applications', user.uid))
      .then((snapshot) => { if (snapshot.exists()) setState('sent'); })
      .catch(() => undefined);
  }, [user.uid]);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setLogo(await shrink(file));
    } catch {
      setProblem('That image could not be read. A JPEG or PNG works best.');
    }
  }

  async function send() {
    if (!name.trim()) { setProblem('A name, at least.'); return; }
    setState('saving');
    setProblem(null);
    try {
      await setDoc(doc(db, 'contests', CONTEST, 'applications', user.uid), {
        name: name.trim(),
        // A team name is optional and falls back to their own, so nobody is nameless in the table.
        teamName: teamName.trim() || name.trim(),
        phone: phone.trim(),
        logo: logo ?? '',
        appliedAt: new Date(),
      });
      setState('sent');
    } catch (cause) {
      setState('form');
      setProblem((cause as Error).message);
    }
  }

  if (state === 'sent') {
    return (
      <div className="card gate">
        <h2>You're on the list</h2>
        <p>
          Ray adds everyone himself, so give him a bit. He'll text you the moment you're in and you
          can pick your team.
        </p>
        <p className="footnote">Signed in as {user.email}</p>
      </div>
    );
  }

  return (
    <div className="card prose register">
      <h2>Join the league</h2>
      <p>Tell Ray who you are and he'll add you to the league.</p>

      <label>
        <span>Your name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ray Reznick" />
      </label>

      <label>
        <span>Team name <em>optional</em></span>
        <input
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          placeholder={name || 'Defaults to your name'}
        />
      </label>

      <label>
        <span>Phone <em>only Ray sees this</em></span>
        <input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(typingPhone(event.target.value))}
          placeholder="(425) 471-4580"
        />
      </label>

      <label className="badgepick">
        <span>Team badge <em>optional</em></span>
        <div className="badgerow">
          {logo ? <img className="badge" src={logo} alt="" /> : <span className="badge empty" />}
          <input type="file" accept="image/*" onChange={(event) => void pick(event.target.files?.[0])} />
        </div>
      </label>

      <ThemeChoice />

      {problem && <p className="problem">{problem}</p>}

      <button className="submit" disabled={state === 'saving'} onClick={() => void send()}>
        {state === 'saving' ? 'Sending…' : 'Ask to join'}
      </button>
    </div>
  );
}
