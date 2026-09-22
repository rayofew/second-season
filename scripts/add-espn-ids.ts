/**
 * Puts each player's ESPN id beside his Sleeper one, without touching who is in the pool.
 *
 * The career stats on a player's card come from ESPN, which knows nothing about Sleeper's ids.
 * Sleeper's directory carries an espn_id field and it is null for most players signed since about
 * 2022 — Purdy, Nacua, Maye, Caleb Williams — so it is no use for the men anybody actually holds.
 *
 * ESPN's own team rosters are the reliable mapping: thirty-two fetches, every athlete with his id
 * and his name, matched on a flattened name within the same club. Two clubs can hold men of the
 * same name; one club almost never does, which is why the club is part of the key.
 *
 * Deliberately not part of seeding the pool. Re-seeding decides who is in it, and re-deciding that
 * mid-contest would drop the eliminated players whose names the history still needs.
 *
 *   node scripts/add-espn-ids.ts
 */
import { admin } from './admin.ts';

const CONTEST = 'rehearsal-2026';
const db = admin();

/** Flattened hard: punctuation, suffixes and accents are all places two sources disagree. */
const flatten = (name: string) => name
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
  .replace(/[^a-z ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const doc = db.doc(`contests/${CONTEST}/pool/current`);
const players = ((await doc.get()).data()?.players ?? []) as
  { id: string; name: string; position: string; team: string; espnId?: string }[];
if (players.length === 0) { console.log('The pool is empty.'); process.exit(1); }

const clubs = [...new Set(players.map((player) => player.team).filter(Boolean))];
console.log(`Reading ${clubs.length} ESPN rosters…`);

const byClub = new Map<string, Map<string, string>>();
await Promise.all(clubs.map(async (club) => {
  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${club.toLowerCase()}/roster`,
  ).catch(() => null);
  if (!response?.ok) return;

  const data = await response.json() as { athletes?: { items?: { id: string; fullName: string }[] }[] };
  const found = new Map<string, string>();
  for (const group of data.athletes ?? []) {
    for (const athlete of group.items ?? []) found.set(flatten(athlete.fullName), String(athlete.id));
  }
  byClub.set(club, found);
}));

let matched = 0;
const missing: string[] = [];
const updated = players.map((player) => {
  // A team defense has no athlete page, which is not a failure — it has no career either.
  if (player.position === 'DEF') return player;

  const espnId = byClub.get(player.team)?.get(flatten(player.name));
  if (!espnId) { missing.push(`${player.name} (${player.position} ${player.team})`); return player; }
  matched += 1;
  return { ...player, espnId };
});

await doc.update({ players: updated });
console.log(`${matched} matched, ${missing.length} not found.`);
for (const name of missing.slice(0, 12)) console.log(`  ${name}`);
