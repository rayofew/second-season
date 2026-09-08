import { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, google } from './firebase.ts';

/**
 * Signing in, by Google or by email and password.
 *
 * Google alone was the plan, on the grounds that it is one tap and there is no password to lose.
 * That holds right up until somebody's mother has a Yahoo address and no Google account, and the
 * league is exactly the sort of audience that produces one of those. So both, with Google kept
 * first because most people will still take it.
 *
 * Nothing here decides who is in the league. Signing in only proves who somebody is; the
 * commissioner still has to let them in, so an unrecognised stranger who signs up successfully has
 * achieved nothing but a seat in the waiting room.
 */

/**
 * Firebase's own words, which are written for a developer reading a console.
 *
 * A wrong password comes back as 'invalid-credential' whether or not the account exists, which is
 * deliberate on Firebase's part — telling a stranger that an address is registered is how you
 * confirm someone's membership for them. The message below keeps that ambiguity rather than
 * helpfully undoing it.
 */
function saidPlainly(code: string, fallback: string): string {
  switch (code) {
    case 'auth/invalid-email': return 'That does not look like an email address.';
    case 'auth/missing-password': return 'A password, too.';
    case 'auth/weak-password': return 'Six characters at least.';
    case 'auth/email-already-in-use': return 'There is already an account with that email. Sign in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'That email and password do not match.';
    case 'auth/too-many-requests': return 'Too many tries. Give it a few minutes.';
    case 'auth/network-request-failed': return 'No connection. Try again in a moment.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'That way in is not switched on for this project yet.';
    default: return fallback;
  }
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (next) => {
    setUser(next);
    setChecking(false);
  }), []);

  return { user, checking };
}

/** Google's four-colour G, drawn inline so it needs no network and no build step. */
function GoogleMark() {
  return (
    <svg className="gmark" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l6.9 5.4c4.1-3.8 6.6-9.4 6.6-15.7z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8 41.1 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.1-5.6C2.9 17 2 20.4 2 24s.9 7 2.4 10z" />
      <path fill="#EA4335" d="M24 10.2c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4 29.9 2 24 2 15.4 2 8 6.9 4.4 14l7.1 5.6c1.8-5.3 6.7-9.4 12.5-9.4z" />
    </svg>
  );
}

/** Which of the three things somebody is here to do. */
type Mode = 'in' | 'new' | 'lost';

export function SignIn() {
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function change(next: Mode) {
    setMode(next);
    setProblem(null);
    setSent(false);
  }

  async function attempt(work: () => Promise<unknown>) {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (cause) {
      const code = (cause as { code?: string }).code ?? '';
      // Closing the popup is a decision, not a failure, and should not be reported as one.
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      setProblem(saidPlainly(code, (cause as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const withEmail = () => void attempt(async () => {
    if (mode === 'lost') {
      // No actionCodeSettings on purpose: the link then lands on the project's own auth domain,
      // which is always authorised. Pointing it at playoffs.spiteapps.app buys a prettier URL and
      // risks a link that does not work, which on a password reset is the whole thing broken.
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
      return;
    }
    const enter = mode === 'new' ? createUserWithEmailAndPassword : signInWithEmailAndPassword;
    await enter(auth, email.trim(), password);
  });

  if (sent) {
    return (
      <div className="card gate welcome">
        <h2>Check your email</h2>
        <p>
          If there is an account for <strong>{email.trim()}</strong>, a link to set a new password is
          on its way. It expires in an hour, and it may land in spam.
        </p>
        <button className="ghost wide" onClick={() => change('in')}>Back to sign in</button>
      </div>
    );
  }

  return (
    <div className="card gate welcome">
      <img className="banner" src="/banner.jpg" alt="Eastside Second-Season Playoff Challenge" />
      {mode === 'lost' && (
        <p>Your email address, and we will send you a link to set a new password.</p>
      )}

      {mode === 'in' && (
        <div className="newhere">
          <h2>First time here?</h2>
          <p>Make an account and the commissioner will let you in.</p>
          <button className="submit wide join" disabled={busy} onClick={() => change('new')}>
            Create an account
          </button>
        </div>
      )}

      <div className="ways">
        <button className="gbtn" disabled={busy} onClick={() => void attempt(() => signInWithPopup(auth, google))}>
          <GoogleMark />
          <span>Sign in with Google</span>
        </button>
      </div>

      <div className="or"><span>or with an email address</span></div>

      <form
        className="signin"
        onSubmit={(event) => { event.preventDefault(); withEmail(); }}
      >
        <label>
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>

        {mode !== 'lost' && (
          <label>
            <span>Password{mode === 'new' && <em>six characters or more</em>}</span>
            <input
              type="password"
              // Telling the browser which it is, so it offers to save a new one and fills an old one.
              autoComplete={mode === 'new' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}

        {problem && <p className="problem">{problem}</p>}

        <button className="submit wide" type="submit" disabled={busy}>
          {busy ? 'One moment…'
            : mode === 'new' ? 'Create account'
            : mode === 'lost' ? 'Send the link'
            : 'Sign in'}
        </button>
      </form>

      {mode === 'in' ? (
        <div className="signinalts">
          <button className="linky" onClick={() => change('lost')}>Forgot password?</button>
        </div>
      ) : (
        <div className="signinalts">
          <button className="linky" onClick={() => change('in')}>Back to signing in</button>
        </div>
      )}
    </div>
  );
}

export function SignOut({ user }: { user: User }) {
  return (
    <button className="signout" onClick={() => signOut(auth)} title={user.email ?? undefined}>
      {user.displayName ?? user.email} · sign out
    </button>
  );
}
