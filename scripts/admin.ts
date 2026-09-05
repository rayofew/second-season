import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Admin access, which bypasses the security rules entirely.
 *
 * Two ways in, because the same scripts run in two places. On a laptop the credentials are a file
 * path in GOOGLE_APPLICATION_CREDENTIALS; in GitHub Actions they are the JSON itself in a secret,
 * because a workflow has no filesystem worth writing a key to.
 *
 * Nothing here ever takes a path or a key from the repository. This is the credential that can do
 * anything to the league's data, and the repository is public.
 */
export function admin() {
  if (getApps().length === 0) {
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
    const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!inline && !path) {
      throw new Error(
        'No credentials. Set GOOGLE_APPLICATION_CREDENTIALS to the key file, or FIREBASE_SERVICE_ACCOUNT to its contents.',
      );
    }
    const account = JSON.parse(inline ?? readFileSync(path!, 'utf8'));
    initializeApp({ credential: cert(account), projectId: account.project_id });
  }
  return getFirestore();
}
