import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Firebase, configured in the open.
 *
 * These values are not secrets and are not treated as ones. Every Firebase web app ships this
 * object inside its JavaScript bundle, where anybody can read it — the key identifies the project,
 * it does not authorise anything. What actually protects the league is firestore.rules and the
 * sign-in requirement, which is where the effort belongs. Putting this in an environment variable
 * would hide it from the repository and from nobody else.
 */
export const app = initializeApp({
  apiKey: 'AIzaSyCoM5nsfV9a5dAu-SmBWyLZxs_OKUbnkWY',
  authDomain: 'second-season-ffl.firebaseapp.com',
  projectId: 'second-season-ffl',
  storageBucket: 'second-season-ffl.firebasestorage.app',
  messagingSenderId: '826305811324',
  appId: '1:826305811324:web:f08b105f523b8aad594af9',
});

export const auth = getAuth(app);
export const db = getFirestore(app);

/** Google is the only way in: no passwords to handle, and one tap on a phone. */
export const google = new GoogleAuthProvider();
