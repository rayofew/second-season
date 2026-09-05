import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, google } from './firebase.ts';

/**
 * Signing in, which for this league means Google and nothing else.
 *
 * No passwords to store, reset or lose, and one tap on a phone — which matters, because half the
 * eventual audience is relatives who will open this once in January and never think about it again.
 */

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (next) => {
    setUser(next);
    setChecking(false);
  }), []);

  return { user, checking };
}

export function SignIn() {
  const [problem, setProblem] = useState<string | null>(null);

  async function enter() {
    setProblem(null);
    try {
      await signInWithPopup(auth, google);
    } catch (cause) {
      // Closing the popup is a decision, not a failure, and should not be reported as one.
      const code = (cause as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      setProblem(
        code === 'auth/configuration-not-found'
          ? 'Google sign-in is not switched on for this project yet.'
          : (cause as Error).message,
      );
    }
  }

  return (
    <div className="card gate">
      <h2>Second Season</h2>
      <p>A private playoff contest. Sign in to find your team.</p>
      <button className="submit" onClick={enter}>
        Continue with Google
      </button>
      {problem && <p className="problem">{problem}</p>}
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
