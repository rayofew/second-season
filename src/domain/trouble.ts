/**
 * Firestore's refusals, said to the person they happened to.
 *
 * "Missing or insufficient permissions" is written for whoever wrote the rules. To a manager it
 * reads like the app is broken, when almost always it means something true and simple: he is not
 * in this league. Somebody removed him, or he is signed in with the wrong account — the second
 * being easy to do when a phone offers three Google addresses and one of them was used to join.
 */
export function explain(cause: unknown): string {
  const code = (cause as { code?: string } | null)?.code ?? '';
  switch (code) {
    // Two causes now, not one. The rules also refuse anything past its lock — a team after kickoff,
    // a game's money after its first round, another manager's team without a notice — and telling
    // the commissioner he was not in his own league, when he had pressed Save on a finished game,
    // was the message being confidently wrong.
    case 'permission-denied':
      return 'That was refused. Usually it is past a lock — a team after its round has kicked off, or a '
        + 'game’s money after its first round — or you are signed in with a different account than the '
        + 'one you joined with. Sign out and back in, and ask the commissioner if it still refuses.';
    case 'unauthenticated':
      return 'Your sign-in has expired. Sign out and back in.';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'No answer from the database. Check your connection and try again.';
    case 'not-found':
      return 'That is not there any more.';
    default:
      return (cause as Error | null)?.message ?? 'Something went wrong.';
  }
}

/** Whether a failure means "you are not a member", which the app can act on rather than only print. */
export const isRefusal = (cause: unknown): boolean =>
  (cause as { code?: string } | null)?.code === 'permission-denied';
