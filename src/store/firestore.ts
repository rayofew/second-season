import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, increment, limit, orderBy, query, setDoc, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import type { HeldPlayer } from '../domain/multiplier.ts';
import type { StatLine } from '../domain/scoring.ts';
import type { ContestSettings } from '../domain/rules.ts';
import type { Post } from '../domain/post.ts';
import type { Prizes } from '../domain/pool.ts';
import type { Plan } from '../domain/payouts.ts';
import { shortName, splitName } from '../domain/name.ts';
import { db } from '../firebase.ts';

/**
 * Reading the contest as a signed-in manager.
 *
 * Every call here goes through the security rules, which is the point: if a manager could read
 * something he should not, this is where it would show, and the emulator would not save us because
 * the rules are the same ones deployed.
 */

export interface RoundConfig {
  round: number;
  name: string;
  seasonType: 'regular' | 'post';
  week: number;
  status: 'upcoming' | 'open' | 'locked' | 'final';
}

export interface Matchup {
  home: string;
  away: string;
  winner: string | null;
}

export interface Seeding {
  conference: string;
  seed: number;
}

export interface Contest {
  name: string;
  /** Scoring, slots, the bye rule and tiebreakers, exactly as the engines read them. */
  settings: ContestSettings;
  season: number;
  rounds: RoundConfig[];
  currentRound: number;
  status: string;
  commissioners: string[];
  field: Record<string, Seeding>;
  /** Firestore returns timestamps; kept as dates so a countdown needs no conversion. */
  locks: Record<string, Date>;
  /** Buy-in, places, split and weekly prize. Missing means nobody is playing for anything. */
  prizes?: Prizes;
  /**
   * When the next real contest kicks off, for the countdown on Home. Set from Commish; missing
   * means the app falls back to its own estimate of Wild Card weekend.
   */
  nextKickoff?: Date;
  /**
   * The most teams this game takes, or none for no limit. Ray: "we also need to put a cap on the
   * amount of players". Counts everybody let in, paid or not; past it, sign-ups join a waitlist.
   */
  cap?: number | null;
}

export interface RoundTeams {
  alive: string[];
  byes: string[];
  matchups: Matchup[];
}

export async function readContest(contestId: string): Promise<Contest | null> {
  const snapshot = await getDoc(doc(db, 'contests', contestId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    ...data,
    locks: Object.fromEntries(
      Object.entries(data.locks ?? {}).map(([round, at]) => [round, (at as { toDate(): Date }).toDate()]),
    ),
    nextKickoff: data.nextKickoff ? (data.nextKickoff as { toDate(): Date }).toDate() : undefined,
    prizes: data.prizes
      ? { ...data.prizes, lockedAt: data.prizes.lockedAt ? (data.prizes.lockedAt as { toDate(): Date }).toDate() : undefined }
      : undefined,
  } as Contest;
}

/**
 * Every team as the public sees it: its name and its logo, and nothing else.
 *
 * The entries carry the manager's real name, so they stay readable by members only and a visitor
 * reads this instead. Rules cannot hide a field, which is why it is a document of its own rather
 * than a filter on the screen. One document, so a visitor pays one read for the whole league.
 *
 * Written only by the commissioner's browser, which keeps it in step with the entries every time
 * it opens the app (see syncTeamLabels). A rename by any route — the commissioner's screens, the
 * admit script, the stand-ins — therefore reaches the public at the commissioner's next visit.
 */
export interface TeamLabel {
  uid: string;
  teamName: string;
  logo: string;
}

export async function readTeamLabels(contestId: string): Promise<TeamLabel[]> {
  const snapshot = await getDoc(doc(db, 'contests', contestId, 'public', 'teams'));
  const teams = (snapshot.data()?.teams ?? {}) as Record<string, { teamName?: string; logo?: string }>;
  return Object.entries(teams).map(([uid, team]) => ({ uid, teamName: team.teamName || 'Team', logo: team.logo ?? '' }));
}

/** Rewrites the public team list from the entries, but only when something has actually changed. */
export async function syncTeamLabels(contestId: string, managers: readonly Manager[]): Promise<void> {
  const teams = Object.fromEntries(
    [...managers].sort((a, b) => a.uid.localeCompare(b.uid))
      .map((manager) => [manager.uid, { teamName: manager.teamName, logo: manager.logo ?? '' }]),
  );
  const current = await getDoc(doc(db, 'contests', contestId, 'public', 'teams'));
  const had = current.data()?.teams ?? {};
  // How many have paid, as a number and nothing more. The payouts are sized on it, so everybody
  // needs it; who exactly has paid stays on the entries, which only the commissioner reads.
  const paid = managers.filter((manager) => manager.paid).length;
  const same = JSON.stringify(Object.keys(had).sort().map((uid) => [uid, had[uid].teamName, had[uid].logo]))
    === JSON.stringify(Object.keys(teams).map((uid) => [uid, teams[uid]!.teamName, teams[uid]!.logo]))
    && current.data()?.paid === paid;
  if (!same) await setDoc(doc(db, 'contests', contestId, 'public', 'teams'), { teams, paid });
}

/**
 * How many managers have paid, which is the field the payouts are sized on.
 *
 * Ray: "it should only count once i hit the paid button". Read from the public team list, where the
 * commissioner's browser keeps the count; null before it has ever written one.
 */
export async function readPaidCount(contestId: string): Promise<number | null> {
  const snapshot = await getDoc(doc(db, 'contests', contestId, 'public', 'teams')).catch(() => null);
  const paid = snapshot?.data()?.paid;
  return typeof paid === 'number' ? paid : null;
}

/**
 * The league for drawing it: every team's name and logo, from one document.
 *
 * Reading the entries costs one read per manager, every page, every visit — at a hundred managers
 * that alone is most of a day's free allowance by Sunday lunchtime. The public team list carries
 * exactly what a table, a field or a leaderboard draws, in a single read. Only Commish, which needs
 * who has paid and how to reach them, still reads the entries themselves.
 *
 * Empty until the commissioner's browser has written it for the first time; a member then falls
 * back to the entries, so a brand new contest is slower rather than blank.
 */
export async function readLeague(contestId: string): Promise<Manager[]> {
  const labels = await readTeamLabels(contestId).catch(() => []);
  if (labels.length > 0) {
    return labels.map((label) => ({
      uid: label.uid, name: label.teamName, teamName: label.teamName, logo: label.logo, paid: false, visits: 0,
    }));
  }
  return readEntries(contestId).catch(() => []);
}

/** One manager's own entry: one read rather than the whole league's, for the few pages that need it. */
export async function readMine(contestId: string, uid: string): Promise<Manager | null> {
  const snapshot = await getDoc(doc(db, 'contests', contestId, 'entries', uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const name = (data.name as string) ?? uid;
  return {
    uid,
    name,
    teamName: (data.teamName as string) || name,
    logo: (data.logo as string) ?? '',
    paid: Boolean(data.paid),
    visits: (data.visits as number) ?? 0,
    lastSeen: data.lastSeen ? (data.lastSeen as { toDate(): Date }).toDate() : undefined,
    lastReadBoard: data.lastReadBoard ? (data.lastReadBoard as { toDate(): Date }).toDate() : undefined,
  };
}

/**
 * Every lineup for one locked round, in one read.
 *
 * Rosters live one document per manager per round, which is right for writing — each manager owns
 * his own and nobody else's — and expensive for reading: a table of a hundred teams over four rounds
 * was four hundred reads, plus the rules' own lookup on each. Once a round locks its rosters can no
 * longer change (only the commissioner may touch one after the lock), so a copy of all of them in a
 * single document is safe to read instead.
 *
 * The copy is made by the commissioner's browser whenever it opens the app (buildLineups) and by
 * the scoring script. Until it exists, this falls back to reading each roster, so a round is never
 * missing — only slower.
 */
export async function readLineups(
  contestId: string,
  uids: string[],
  round: number,
): Promise<Record<string, HeldPlayer[]>> {
  const copy = await getDoc(doc(db, 'contests', contestId, 'lineups', String(round))).catch(() => null);
  if (copy?.exists()) {
    const stored = (copy.data().rosters ?? {}) as Record<string, HeldPlayer[]>;
    return Object.fromEntries(uids.map((uid) => [uid, stored[uid] ?? []]));
  }
  return readAllRosters(contestId, uids, round);
}

/**
 * Writes the one-document copy of a locked round's lineups, if it is missing or out of date.
 *
 * The commissioner's browser calls this for every locked round each time it opens the app. It costs
 * him one read per manager per round; it saves every other visitor the same, every page they open.
 * Comparing before writing keeps a quiet week from writing at all.
 */
export async function buildLineups(contestId: string, uids: string[], round: number): Promise<void> {
  const rosters = await readAllRosters(contestId, uids, round);
  const ref = doc(db, 'contests', contestId, 'lineups', String(round));
  const had = await getDoc(ref);
  const sorted = (value: Record<string, unknown>) =>
    JSON.stringify(Object.keys(value).sort().map((key) => [key, value[key]]));
  if (had.exists() && sorted(had.data().rosters ?? {}) === sorted(rosters)) return;
  await setDoc(ref, { round, rosters, builtAt: serverTimestamp() });
}

/** The commissioner setting how many teams a game takes; null takes the limit off. */
export async function setCap(contestId: string, cap: number | null): Promise<void> {
  await updateDoc(doc(db, 'contests', contestId), { cap: cap && cap > 0 ? Math.floor(cap) : deleteField() });
}

/** The commissioner setting when the next contest starts, which the countdown on Home runs to. */
export async function setNextKickoff(contestId: string, when: Date | null): Promise<void> {
  await updateDoc(doc(db, 'contests', contestId), { nextKickoff: when ?? deleteField() });
}

export async function readTeams(contestId: string, round: number): Promise<RoundTeams | null> {
  const snapshot = await getDoc(doc(db, 'contests', contestId, 'teams', String(round)));
  return snapshot.exists() ? (snapshot.data() as RoundTeams) : null;
}

export interface PoolPlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  form: number;
  /**
   * The same man's id at ESPN, for his career page.
   *
   * Absent for a team defense, which has no career, and for the handful of men ESPN's current
   * rosters do not list. Put there by scripts/add-espn-ids.ts rather than by seeding, because
   * re-seeding decides who is in the pool and that must not change mid-contest.
   */
  espnId?: string;
}

/** The whole board in a single read, rather than a query a phone pays for repeatedly. */
export async function readPool(contestId: string): Promise<PoolPlayer[]> {
  const snapshot = await getDoc(doc(db, 'contests', contestId, 'pool', 'current'));
  return snapshot.exists() ? ((snapshot.data().players ?? []) as PoolPlayer[]) : [];
}

/**
 * Every roster this manager has submitted, in round order.
 *
 * Read in full rather than round by round because the multiplier is a property of the history: what
 * a player is worth this week depends on every week before it.
 */
export async function readHistory(contestId: string, uid: string, upTo: number): Promise<HeldPlayer[][]> {
  const rounds = await Promise.all(
    Array.from({ length: upTo + 1 }, (_, round) => getDoc(doc(db, 'contests', contestId, 'entries', uid, 'rounds', String(round)))),
  );
  return rounds.map((snapshot) => (snapshot.exists() ? ((snapshot.data().players ?? []) as HeldPlayer[]) : []));
}

/**
 * Submitting a roster.
 *
 * The lock is not checked here. It is checked by the security rules against the server's clock,
 * because a check in this file runs on the manager's phone and believes whatever the phone says
 * the time is. A late write fails, and it fails at the database.
 */
export async function saveRoster(
  contestId: string,
  uid: string,
  round: number,
  players: HeldPlayer[],
): Promise<void> {
  await setDoc(doc(db, 'contests', contestId, 'entries', uid, 'rounds', String(round)), {
    players,
    submittedAt: serverTimestamp(),
  });
  /*
   * How many slots are filled, and for which round, on the entry itself.
   *
   * The commissioner needs to know who still has gaps before the lock — "7 of 9" is somebody to
   * chase — and he is no longer allowed to read anybody's team before the lock to find out. A count
   * says who to chase without saying who they picked.
   */
  await setDoc(doc(db, 'contests', contestId, 'entries', uid), { filled: players.length, filledRound: round }, { merge: true })
    .catch(() => undefined);
}

export interface Manager {
  uid: string;
  name: string;
  /** What they called their team. Falls back to their own name, so nobody is nameless in the table. */
  teamName: string;
  /** A small square, stored as a data URL because Cloud Storage needs the paid plan. */
  logo: string;
  /** Whether the commissioner has seen their money. Recorded here, settled between people. */
  paid: boolean;
  /** When this manager last had the app open. Undefined means they have never opened it. */
  lastSeen?: Date;
  /** How many times they have opened it, ever. */
  visits: number;
  /** When they last looked at the board, so Home can say what has been said since. */
  lastReadBoard?: Date;
  /** Slots filled in the round named by filledRound, as their own save recorded it. */
  filled?: number;
  filledRound?: number;
}

/** Who is in the league. Readable by any member — but never their phone number, which stays on the application. */
export async function readEntries(contestId: string): Promise<Manager[]> {
  const snapshot = await getDocs(collection(db, 'contests', contestId, 'entries'));
  return snapshot.docs.map((entry) => {
    const data = entry.data();
    const name = (data.name as string) ?? entry.id;
    return {
      uid: entry.id,
      name,
      teamName: (data.teamName as string) || name,
      logo: (data.logo as string) ?? '',
      paid: Boolean(data.paid),
      lastSeen: (data.lastSeen as { toDate?: () => Date } | undefined)?.toDate?.(),
      visits: Number(data.visits) || 0,
      lastReadBoard: (data.lastReadBoard as { toDate?: () => Date } | undefined)?.toDate?.(),
      filled: typeof data.filled === 'number' ? data.filled : undefined,
      filledRound: typeof data.filledRound === 'number' ? data.filledRound : undefined,
    };
  });
}

/**
 * Note that somebody has the app open, once per session.
 *
 * Firebase Auth knows when each account last signed in, but only the Admin SDK can read that for
 * anybody other than the person asking — and there is no server here. So the league keeps its own
 * note: the manager's own browser stamps his own entry, which the rules allow him and nobody else
 * to do.
 *
 * He could therefore lie about it, and it does not matter. The question it answers is "has Eric
 * ever actually opened the thing I sent him", and nobody fakes having not used an app.
 */
export async function noteVisit(contestId: string, uid: string): Promise<void> {
  await setDoc(
    doc(db, 'contests', contestId, 'entries', uid),
    { lastSeen: serverTimestamp(), visits: increment(1) },
    { merge: true },
  );
}

/**
 * A round's statistics as the scoring job left them.
 *
 * The raw total is stored alongside, but the table recomputes from the stat lines rather than
 * trusting it — same reason standings are derived rather than saved. If the two ever disagree, the
 * stat line is the truth and the stored figure is a stale cache.
 */
export async function readScores(contestId: string, round: number): Promise<Record<string, StatLine>> {
  const snapshot = await getDoc(doc(db, 'contests', contestId, 'scores', String(round)));
  if (!snapshot.exists()) return {};
  const players = (snapshot.data().players ?? {}) as Record<string, { raw: number; stats: StatLine }>;
  return Object.fromEntries(Object.entries(players).map(([id, entry]) => [id, entry.stats]));
}

/**
 * Everybody's roster for one round.
 *
 * Only ever called for rounds that have locked, because the rules refuse a manager another
 * manager's roster until then — which is the point of the rule, not an obstacle to it.
 */
export async function readAllRosters(
  contestId: string,
  uids: string[],
  round: number,
): Promise<Record<string, HeldPlayer[]>> {
  const docs = await Promise.all(
    uids.map((uid) => getDoc(doc(db, 'contests', contestId, 'entries', uid, 'rounds', String(round)))),
  );
  const rosters: Record<string, HeldPlayer[]> = {};
  uids.forEach((uid, index) => {
    const snapshot = docs[index]!;
    rosters[uid] = snapshot.exists() ? ((snapshot.data().players ?? []) as HeldPlayer[]) : [];
  });
  return rosters;
}

/** Every round's bracket at once. Rounds that have not been drawn yet come back null. */
export async function readAllTeams(contestId: string, rounds: number): Promise<(RoundTeams | null)[]> {
  const docs = await Promise.all(
    Array.from({ length: rounds }, (_, round) => getDoc(doc(db, 'contests', contestId, 'teams', String(round)))),
  );
  return docs.map((snapshot) => (snapshot.exists() ? (snapshot.data() as RoundTeams) : null));
}

export interface Application {
  uid: string;
  /** Both halves, for the commissioner deciding whether he knows this person. */
  name: string;
  firstName: string;
  lastName: string;
  teamName: string;
  /** Only the commissioner and the applicant can read these. They never reach an entry. */
  phone: string;
  email: string;
  logo: string;
}

/** Who has asked to join. Refused to anyone but the commissioner. */
export async function readApplications(contestId: string): Promise<Application[]> {
  const snapshot = await getDocs(collection(db, 'contests', contestId, 'applications'));
  return snapshot.docs.map((application) => {
    const data = application.data();
    const name = (data.name as string) ?? application.id;
    // Applications written before the name was split have only the one field, so the halves are
    // recovered from it rather than coming back empty.
    const halves = splitName(name);
    return {
      uid: application.id,
      name,
      firstName: (data.firstName as string) ?? halves.first,
      lastName: (data.lastName as string) ?? halves.last,
      teamName: (data.teamName as string) || name,
      phone: (data.phone as string) ?? '',
      email: (data.email as string) ?? '',
      logo: (data.logo as string) ?? '',
    };
  });
}

/**
 * Turning an application into a membership.
 *
 * The phone number is deliberately not copied. An entry is readable by the whole league, and a
 * number given to the commissioner was not given to everybody.
 */
export async function admitManager(contestId: string, application: Application): Promise<void> {
  await setDoc(doc(db, 'contests', contestId, 'entries', application.uid), {
    // The short form only. An entry is readable by the whole league, and a surname given to the
    // commissioner was not given to everybody — the same reason the phone number stays behind.
    name: shortName(application.firstName, application.lastName) || application.name,
    teamName: application.teamName,
    logo: application.logo,
    joinedAt: serverTimestamp(),
  });
}

/**
 * How many slots each manager has filled for a round.
 *
 * A count rather than a yes, because a roster of four is not a roster and the old answer said
 * it was — anybody who had started and wandered off showed as done, which is precisely the
 * manager who most needs chasing.
 */
export async function readSubmitted(
  contestId: string,
  uids: string[],
  round: number,
): Promise<Map<string, number>> {
  const docs = await Promise.all(
    uids.map((uid) => getDoc(doc(db, 'contests', contestId, 'entries', uid, 'rounds', String(round)))),
  );
  const filled = new Map<string, number>();
  uids.forEach((uid, index) => {
    const snapshot = docs[index]!;
    filled.set(uid, snapshot.exists() ? ((snapshot.data().players as unknown[]) ?? []).length : 0);
  });
  return filled;
}

/**
 * The message board.
 *
 * Readable by the league and written by anybody in it, which is the whole point — a group chat
 * that does not scroll away, kept next to the thing it is about. The writer's name is copied in
 * rather than looked up, so renaming a team does not quietly rewrite what somebody said in January.
 */
export async function readPosts(contestId: string, count = 200): Promise<Post[]> {
  const snapshot = await getDocs(query(
    collection(db, 'contests', contestId, 'posts'),
    orderBy('at', 'desc'),
    limit(count),
  ));
  return snapshot.docs.map((entry) => {
    const data = entry.data();
    return {
      id: entry.id,
      uid: data.uid as string,
      name: (data.name as string) ?? 'Somebody',
      text: (data.text as string) ?? '',
      at: (data.at as { toDate(): Date } | null)?.toDate() ?? new Date(),
      wantsEmail: Boolean(data.wantsEmail),
      emailedAt: (data.emailedAt as { toDate?: () => Date } | undefined)?.toDate?.(),
    };
  });
}

export async function writePost(
  contestId: string,
  post: { uid: string; name: string; text: string; wantsEmail: boolean },
): Promise<void> {
  await addDoc(collection(db, 'contests', contestId, 'posts'), { ...post, at: serverTimestamp() });
}

/**
 * Notes that this manager has looked at the board.
 *
 * On his own entry, which is the one document he is allowed to write about himself, so what he has
 * read follows him from his phone to his desk rather than living in one browser's storage. The
 * worst a lie here can do is hide a notice from the person telling it.
 */
export async function noteBoardRead(contestId: string, uid: string): Promise<void> {
  await setDoc(
    doc(db, 'contests', contestId, 'entries', uid),
    { lastReadBoard: serverTimestamp() },
    { merge: true },
  );
}

export async function removePost(contestId: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'contests', contestId, 'posts', id));
}

/** Noted once the commissioner has actually sent it, so nobody sends the same news twice. */
export async function markEmailed(contestId: string, id: string): Promise<void> {
  await updateDoc(doc(db, 'contests', contestId, 'posts', id), { emailedAt: serverTimestamp() });
}

export interface Move {
  uid: string;
  round: number;
  /** 'in' and 'out' are the two halves of a swap; 'submitted' marks the roster being sent. */
  action: 'in' | 'out' | 'submitted';
  playerId: string;
  playerName: string;
  slot: string;
  at: Date;
}

/**
 * Recording what somebody did, in the order they did it.
 *
 * Append only, and written from the browser because only the browser knows a manager pressed
 * submit. The roster documents remain the authority on what was actually played; this is the story
 * of how it got that way, which the rosters alone cannot tell you — a man signed and dropped again
 * before the lock leaves no trace in them at all.
 */
export async function recordMoves(
  contestId: string,
  moves: Omit<Move, 'at'>[],
  /**
   * When it happened, for the commissioner writing a stand-in's history.
   *
   * A manager's own moves take the server's clock, because his browser's is not evidence of
   * anything. Nothing is being proved about a stand-in — he is not a person — and six managers
   * stamped the same second are obviously one person pressing a button.
   */
  at?: Date,
): Promise<void> {
  await Promise.all(
    moves.map((move) =>
      addDoc(collection(db, 'contests', contestId, 'log'), { ...move, at: at ?? serverTimestamp() }),
    ),
  );
}

/**
 * Whether this manager already has moves recorded for this round.
 *
 * The log is append only, so playing a round twice would write a second set and leave somebody
 * apparently signing the same player twice in an afternoon. Two equality filters need no composite
 * index, so this costs one small read.
 */
export async function hasMoves(contestId: string, uid: string, round: number): Promise<boolean> {
  const found = await getDocs(query(
    collection(db, 'contests', contestId, 'log'),
    where('uid', '==', uid),
    where('round', '==', round),
    limit(1),
  ));
  return !found.empty;
}

/**
 * Everything that has happened, newest first.
 *
 * Rules are not filters, and for a query they are stricter than that. A manager may read a move
 * only once its round has locked, which the rule expresses as a comparison against
 * resource.data.round — and Firestore will only allow a query whose own constraints prove what
 * that field is. An equality on round does; a range does not, and nor does asking for everything.
 * Both are refused outright, so the manager sees nothing at all, including weeks that finished a
 * month ago.
 *
 * Hence one query per locked round rather than one clever one. There are four rounds in a
 * postseason, so this is four reads at worst, and each of them is a question the rules can answer.
 * A commissioner may read the lot and asks in a single query with no rounds given.
 *
 * Verified against the live rules rather than reasoned about: round == 0 is allowed and returns
 * sixty-six documents where round <= 0 is refused, which is not a difference anybody would guess.
 */
export async function readMoves(contestId: string, rounds?: readonly number[]): Promise<Move[]> {
  const log = collection(db, 'contests', contestId, 'log');

  const pages = rounds === undefined
    ? [await getDocs(query(log, orderBy('at', 'desc'), limit(300)))]
    : await Promise.all(rounds.map((round) => getDocs(query(log, where('round', '==', round), limit(300)))));

  return pages
    .flatMap((snapshot) => snapshot.docs)
    .map((entry) => {
      const data = entry.data();
      return { ...data, at: (data.at as { toDate(): Date } | null)?.toDate() ?? new Date() } as Move;
    })
    .sort((first, second) => second.at.getTime() - first.at.getTime());
}

/**
 * Turning somebody away.
 *
 * Deletes the application, which clears the list — it does not bar them, and they could fill the
 * form in again. Barring somebody would need a list of the barred, which is a lot of machinery for
 * a league where the commissioner knows everyone by name.
 */
/**
 * Keeps a manager reachable, without putting his address where the league can read it.
 *
 * The application is the one document that survives being admitted and that only he and the
 * commissioner may read — the same place his phone number already lives, and for the same
 * reason. An email on the entry would be an email handed to everybody.
 *
 * Called on sign-in rather than only at registration, so the people who joined before any of
 * this existed become reachable the next time they open the app.
 */
export async function rememberEmail(contestId: string, uid: string, email: string | null): Promise<void> {
  if (!email) return;
  const ref = doc(db, 'contests', contestId, 'applications', uid);
  const known = await getDoc(ref).catch(() => null);
  if (known?.exists() && known.data().email === email) return;
  await setDoc(ref, { email }, { merge: true });
}

export async function declineApplication(contestId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, 'contests', contestId, 'applications', uid));
}

/**
 * Taking a manager out of the league.
 *
 * Removes the entry, which is what membership is, so they lose their place immediately and fall
 * back to the join form. Their rosters are left where they are: Firestore does not delete a
 * subcollection with its parent, and a roster that has already been scored is part of the record.
 * If they are let back in, they find their old team waiting.
 */
/**
 * Taking a manager out, and everything he submitted with him.
 *
 * Firestore does not delete a subcollection along with its document, so removing an entry used
 * to leave every roster he had ever sent behind. Re-admitting him would then bring those teams
 * back, handing him streaks he had not held — and until then they sat in a collection the whole
 * league can read once a round has locked.
 */
export async function removeManager(contestId: string, uid: string, rounds: number): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await deleteDoc(doc(db, 'contests', contestId, 'entries', uid, 'rounds', String(round)))
      .catch(() => undefined);
  }
  await deleteDoc(doc(db, 'contests', contestId, 'entries', uid));
}

/**
 * Putting a stand-in manager into the league, and taking one out again.
 *
 * Written from the browser as the commissioner rather than by a script holding a service account
 * key, because the rules already allow exactly this: a commissioner may create an entry and may
 * write anybody's roster. Requiring a key for something the rules permit would be inventing a
 * second, worse door into the same room.
 */
export async function addStandIn(
  contestId: string,
  uid: string,
  fields: { name: string; teamName: string },
): Promise<void> {
  await setDoc(doc(db, 'contests', contestId, 'entries', uid), {
    ...fields,
    logo: '',
    paid: false,
    joinedAt: serverTimestamp(),
  });
}

/**
 * Which entries are invented, and how each one plays.
 *
 * Kept in the commissioner's own document rather than on the entries, because an entry is
 * readable by every member and a field marking one as a stand-in would announce exactly the
 * thing it records. Same reasoning that keeps a phone number off an entry.
 */
export interface StandInRegister {
  [uid: string]: string;
}

export async function readStandIns(contestId: string): Promise<StandInRegister> {
  const snapshot = await getDoc(doc(db, 'contests', contestId, 'admin', 'standins'));
  return snapshot.exists() ? ((snapshot.data().temperaments ?? {}) as StandInRegister) : {};
}

export async function writeStandIns(contestId: string, temperaments: StandInRegister): Promise<void> {
  await setDoc(doc(db, 'contests', contestId, 'admin', 'standins'), { temperaments });
}

/**
 * A roster written on somebody else's behalf.
 *
 * The same path a commissioner already uses to fix a team for a manager who cannot; the rules do
 * not distinguish, and neither does this.
 */
export async function writeRosterFor(
  contestId: string,
  uid: string,
  round: number,
  players: HeldPlayer[],
): Promise<void> {
  await setDoc(doc(db, 'contests', contestId, 'entries', uid, 'rounds', String(round)), {
    players,
    submittedAt: serverTimestamp(),
  });
}

/** A stand-in is removed the same way anybody is. */
export const removeStandIn = removeManager;

/**
 * Appointing or standing down a co-commissioner.
 *
 * The rules refuse any update that drops the owner from the list, so the man who set the contest up
 * keeps it whatever anybody presses. This function does not need to know that, and deliberately
 * does not check: a guard that lives only in the client is not a guard.
 */
export async function setCommissioners(contestId: string, commissioners: string[]): Promise<void> {
  await updateDoc(doc(db, 'contests', contestId), { commissioners });
}

/**
 * Finalising a round and opening the next.
 *
 * Three writes that belong together: the decided matchups, the next round's draw, and the contest
 * moving on. Firestore batches them, so a round cannot end up decided with nothing following it —
 * which on a Monday night, with one chance to get it right, is worth the extra few lines.
 */
export async function advanceRound(
  contestId: string,
  round: number,
  decided: { home: string; away: string; winner: string }[],
  through: string[],
  pairings: { home: string; away: string; winner: string | null }[],
  /**
   * When the next round should lock.
   *
   * The first kickoff involving a club still in it, which is not the same as the first kickoff of
   * the week: by the Conference round four clubs are left and none of them may play until Sunday,
   * so a Thursday lock takes three days of picking away and protects nothing. Left alone when the
   * caller does not know, so a seeded lock survives.
   */
  nextLock?: Date,
): Promise<void> {
  const contestRef = doc(db, 'contests', contestId);
  const snapshot = await getDoc(contestRef);
  const rounds = (snapshot.data()?.rounds ?? []) as { round: number; status: string }[];
  const next = round + 1;
  const hasNext = rounds.some((entry) => entry.round === next);

  const batch = writeBatch(db);
  batch.update(doc(db, 'contests', contestId, 'teams', String(round)), { matchups: decided });
  if (hasNext) {
    batch.set(doc(db, 'contests', contestId, 'teams', String(next)), { alive: through, byes: [], matchups: pairings });
    batch.update(contestRef, {
      currentRound: next,
      ...(nextLock ? { [`locks.${next}`]: nextLock } : {}),
      rounds: rounds.map((entry) =>
        entry.round === round ? { ...entry, status: 'final' }
        : entry.round === next ? { ...entry, status: 'open' }
        : entry,
      ),
    });
  } else {
    batch.update(contestRef, { status: 'final' });
  }
  await batch.commit();
}

/** The whole prize arrangement. Nothing here handles money — it is a note of what was agreed. */
export async function setPrizes(contestId: string, prizes: Prizes): Promise<void> {
  // undefined is not a value Firestore will store, and a plan locked in carries a server timestamp.
  const { lockedAt, ...rest } = prizes;
  await updateDoc(doc(db, 'contests', contestId), {
    prizes: JSON.parse(JSON.stringify({ ...rest })),
    ...(lockedAt ? { 'prizes.lockedAt': serverTimestamp() } : {}),
  });
}

/** Ticking somebody off as having paid. A note in a ledger, not a transaction. */
export async function setPaid(contestId: string, uid: string, paid: boolean): Promise<void> {
  await updateDoc(doc(db, 'contests', contestId, 'entries', uid), { paid });
}

export interface Correction {
  raw: number;
  reason: string;
  by: string;
  at: Date;
}

/** What the commissioner has set by hand for a round, by player. */
export async function readCorrections(contestId: string, round: number): Promise<Record<string, Correction>> {
  const snapshot = await getDoc(doc(db, 'contests', contestId, 'corrections', String(round)));
  if (!snapshot.exists()) return {};
  const data = snapshot.data() as Record<string, { raw: number; reason: string; by: string; at?: { toDate(): Date } }>;
  return Object.fromEntries(
    Object.entries(data).map(([playerId, entry]) => [
      playerId,
      { ...entry, at: entry.at?.toDate() ?? new Date() },
    ]),
  );
}

/**
 * Setting a figure by hand, or taking the correction away again.
 *
 * A reason is required. A number somebody changed for a forgotten reason is worse than the number
 * they changed it from, and in February it is the only thing anybody will ask about.
 */
export async function setCorrection(
  contestId: string,
  round: number,
  playerId: string,
  correction: { raw: number; reason: string; by: string } | null,
): Promise<void> {
  const ref = doc(db, 'contests', contestId, 'corrections', String(round));
  await setDoc(
    ref,
    { [playerId]: correction ? { ...correction, at: new Date() } : deleteField() },
    { merge: true },
  );
}

/* ------------------------------------------------------------------------------------------------
 * Games, and the one profile a person carries between them.
 *
 * Ray: "i should be able to run as many games as i want". A game is a contest like the rehearsal,
 * each with its own bracket, rosters, standings and money. The list of them lives in one public
 * document, site/games, which the owner edits from Commish: a name, whether it is switched on, and
 * nothing else. Switching one off hides it from players without deleting a thing.
 * ---------------------------------------------------------------------------------------------- */

export interface Game {
  id: string;
  name: string;
  /** Shown to players, and open for sign-ups until its first lock. Off hides it from all but the owner. */
  enabled: boolean;
}

/** Before the list exists the site has exactly one game, the rehearsal, which is how it always was. */
export const FALLBACK_GAMES: Game[] = [{ id: 'rehearsal-2026', name: 'Rehearsal', enabled: true }];

export async function readGames(): Promise<Game[]> {
  const snapshot = await getDoc(doc(db, 'site', 'games')).catch(() => null);
  const games = (snapshot?.data()?.games ?? []) as Game[];
  return games.length > 0 ? games : FALLBACK_GAMES;
}

export async function saveGames(games: readonly Game[]): Promise<void> {
  await setDoc(doc(db, 'site', 'games'), { games: games.map(({ id, name, enabled }) => ({ id, name, enabled })) });
}

/** "High Stakes" → "high-stakes-2027". Lower case and dashes, because it ends up in addresses. */
export const gameIdFor = (name: string, year: number): string =>
  `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game'}-${year}`;

/**
 * A new, empty game: switched off, nobody in it, no bracket and no players yet.
 *
 * What a January game needs that a browser cannot give it — the player pool and the real bracket
 * seeds — is written by the setup scripts once the playoff field is known, the same as the
 * rehearsal's was (seed-pool.ts and seed-bracket.ts, run with GAME set to this id). The round weeks
 * below are the NFL postseason's own numbering and are checked by that setup.
 */
export async function createGame(
  id: string,
  name: string,
  owner: string,
  settings: ContestSettings,
  season: number,
): Promise<void> {
  // Never over the top of one that exists. A game taken off the list keeps its contest, and putting
  // the same name back must bring that contest back as it was, not wipe it for an empty one.
  const existing = await getDoc(doc(db, 'contests', id)).catch(() => null);
  if (existing?.exists()) return;
  await setDoc(doc(db, 'contests', id), {
    name,
    season,
    settings,
    rounds: [
      { round: 0, name: 'Wild Card', seasonType: 'post', week: 1, status: 'upcoming' },
      { round: 1, name: 'Divisional', seasonType: 'post', week: 2, status: 'upcoming' },
      { round: 2, name: 'Conference', seasonType: 'post', week: 3, status: 'upcoming' },
      { round: 3, name: 'Super Bowl', seasonType: 'post', week: 5, status: 'upcoming' },
    ],
    currentRound: 0,
    status: 'upcoming',
    commissioners: [owner],
    field: {},
    locks: {},
  });
}

/**
 * Who somebody is, once, for every game they join.
 *
 * Ray: team name and logo the same everywhere. The phone number is here too, so a player updates it
 * once rather than once per game, and it is readable only by them and the owner — never the league.
 * Joining a game copies it into that game's application, which is what the commissioner admits.
 */
export interface Profile {
  firstName: string;
  lastName: string;
  teamName: string;
  logo: string;
  phone: string;
  email: string;
  /** Games this person has already been asked about, so the sign-in step does not ask twice. */
  seen: string[];
}

export async function readProfile(uid: string): Promise<Profile | null> {
  const snapshot = await getDoc(doc(db, 'profiles', uid)).catch(() => null);
  if (!snapshot?.exists()) return null;
  const data = snapshot.data();
  return {
    firstName: data.firstName ?? '',
    lastName: data.lastName ?? '',
    teamName: data.teamName ?? '',
    logo: data.logo ?? '',
    phone: data.phone ?? '',
    email: data.email ?? '',
    seen: Array.isArray(data.seen) ? data.seen : [],
  };
}

export async function saveProfile(uid: string, profile: Profile): Promise<void> {
  await setDoc(doc(db, 'profiles', uid), { ...profile, updatedAt: serverTimestamp() });
}

/** What this person has asked to join, and been let into, in one game. */
export async function readStanding(gameId: string, uid: string): Promise<'in' | 'waiting' | 'out'> {
  const entry = await getDoc(doc(db, 'contests', gameId, 'entries', uid)).catch(() => null);
  if (entry?.exists()) return 'in';
  const application = await getDoc(doc(db, 'contests', gameId, 'applications', uid)).catch(() => null);
  return application?.exists() ? 'waiting' : 'out';
}

/** Asking to join a game, with the profile copied onto the application the commissioner reads. */
export async function joinGame(gameId: string, uid: string, profile: Profile): Promise<void> {
  await setDoc(doc(db, 'contests', gameId, 'applications', uid), {
    name: [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim(),
    firstName: profile.firstName,
    lastName: profile.lastName,
    teamName: profile.teamName || shortName(profile.firstName, profile.lastName),
    phone: profile.phone,
    email: profile.email,
    logo: profile.logo,
    appliedAt: serverTimestamp(),
  });
}

/** Taking back a request to join, before the commissioner has let them in. After that, it is his call. */
export async function leaveGame(gameId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, 'contests', gameId, 'applications', uid));
}

/* ------------------------------------------------------------------------------------------------
 * Opening somebody else's team.
 *
 * Ray: "the commish is able to see other lineups before a week has locked giving the commish an
 * unfair advantage. There may be times when the commish needs to look at a line up or change a
 * lineup, but if this happens I feel as if the league should know about it." So the rules no
 * longer let a commissioner read or write anybody's team just because he is one. He may open a
 * particular team for a particular round only once a notice exists for it — who, whose, which
 * round, why — and that notice can never be edited or deleted, by him or anybody. Writing it also
 * posts to the Board, and the player sees it on Home. No exceptions.
 * ---------------------------------------------------------------------------------------------- */

export interface Notice {
  round: number;
  uid: string;
  teamName: string;
  by: string;
  byName: string;
  reason: string;
  at: Date;
}

const noticeId = (round: number, uid: string) => `${round}_${uid}`;

export async function readNotice(contestId: string, round: number, uid: string): Promise<Notice | null> {
  const snapshot = await getDoc(doc(db, 'contests', contestId, 'notices', noticeId(round, uid))).catch(() => null);
  if (!snapshot?.exists()) return null;
  const data = snapshot.data();
  return { ...(data as Omit<Notice, 'at'>), at: (data.at as { toDate(): Date } | null)?.toDate() ?? new Date() };
}

/** Every notice about one player's team, newest first, for their Home. */
export async function readNoticesFor(contestId: string, uid: string): Promise<Notice[]> {
  const snapshot = await getDocs(query(collection(db, 'contests', contestId, 'notices'), where('uid', '==', uid))).catch(() => null);
  return (snapshot?.docs ?? [])
    .map((entry) => {
      const data = entry.data();
      return { ...(data as Omit<Notice, 'at'>), at: (data.at as { toDate(): Date } | null)?.toDate() ?? new Date() };
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * Writes the notice that unlocks one team for one round, and tells the league on the Board.
 *
 * The notice first, because it is what the rules check: until it exists the team stays shut. The
 * Board post second, and a failure there does not undo the notice — the record is the notice, and
 * the player sees it on Home whether or not the post went up.
 */
export async function openTeam(
  contestId: string,
  notice: { round: number; roundName: string; uid: string; teamName: string; by: string; byName: string; reason: string; locked: boolean },
): Promise<void> {
  await setDoc(doc(db, 'contests', contestId, 'notices', noticeId(notice.round, notice.uid)), {
    round: notice.round,
    uid: notice.uid,
    teamName: notice.teamName,
    by: notice.by,
    byName: notice.byName,
    reason: notice.reason,
    at: serverTimestamp(),
  });
  const when = notice.locked ? 'after the lock' : 'before the lock';
  await writePost(contestId, {
    uid: notice.by,
    name: notice.byName,
    text: `**Commissioner notice:** I opened **${notice.teamName}**'s team for the ${notice.roundName} round, ${when}. Reason: ${notice.reason}`,
    wantsEmail: false,
  }).catch(() => undefined);
}

/**
 * The payout table every new game's calculator opens with.
 *
 * Ray: "i just made changes to the tables and there was no save button" — on the rehearsal, whose
 * money can no longer change. Saving his table here gives the work somewhere to live: every game
 * that has no payouts of its own starts from it, so the January games open already filled in.
 * Public to read, like the rest of site/, and only the owner may write it.
 */
export async function readPayoutTemplate(): Promise<Plan | null> {
  const snapshot = await getDoc(doc(db, 'site', 'payouts')).catch(() => null);
  return (snapshot?.data()?.plan as Plan | undefined) ?? null;
}

export async function savePayoutTemplate(plan: Plan): Promise<void> {
  await setDoc(doc(db, 'site', 'payouts'), { plan: JSON.parse(JSON.stringify(plan)), savedAt: serverTimestamp() });
}
