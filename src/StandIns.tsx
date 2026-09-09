import { useCallback, useEffect, useState } from 'react';
import { EASTSIDE } from './domain/rules.ts';
import type { Position } from './domain/rules.ts';
import { pickFor, STAND_INS, STAND_IN_PREFIX, uidFor, WHY } from './domain/standin.ts';
import type { Candidate } from './domain/standin.ts';
import { projectedPoints } from './domain/scoring.ts';
import type { StatLine } from './domain/scoring.ts';
import { projections } from './providers/sleeper.ts';
import {
  addStandIn, readContest, readEntries, readHistory, readPool, readTeams, removeStandIn, writeRosterFor,
} from './store/firestore.ts';
import type { Contest, Manager } from './store/firestore.ts';

/**
 * A field of managers who do not exist, put in from the browser.
 *
 * Six testers who never reply is what blocks every screen that needs more than one team in it, and
 * fake logins would only ever test the login. The rules already let a commissioner create an entry
 * and write anybody's roster, so this needs no service account key and no accounts — it writes the
 * two things the standings, the live board, the pot and a Monday advance actually read.
 *
 * They keep their temperaments between rounds, so playing a week is a decision each rather than a
 * reshuffle: one never lets go and climbs to 4x, one chases the best projection and never leaves
 * 1x, and one submits nothing at all, which is the forgotten-roster path that otherwise goes
 * untested until it happens to a real person in January.
 */

const CONTEST = 'rehearsal-2026';

export function StandIns() {
  const [contest, setContest] = useState<Contest | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [howMany, setHowMany] = useState(6);

  const load = useCallback(async () => {
    try {
      const found = await readContest(CONTEST);
      setContest(found);
      setManagers(await readEntries(CONTEST));
    } catch (cause) {
      setProblem((cause as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const present = managers.filter((manager) => manager.uid.startsWith(STAND_IN_PREFIX));

  /**
   * Picks and submits for every stand-in, for the round that is open.
   *
   * Run it again after advancing and each one behaves in character against the new field, so the
   * multipliers spread out the way they will when real people are doing this.
   */
  async function play(create: boolean) {
    if (!contest) return;
    setBusy(create ? 'add' : 'play');
    setProblem(null);
    setSaid([]);
    const round = contest.currentRound;
    const notes: string[] = [];

    try {
      const config = contest.rounds[round];
      const [pool, teams, expected] = await Promise.all([
        readPool(CONTEST),
        readTeams(CONTEST, round).catch(() => null),
        config
          ? projections(contest.season, config.seasonType, config.week)
              .catch(() => ({}) as Record<string, StatLine>)
          : Promise.resolve({} as Record<string, StatLine>),
      ]);
      if (pool.length === 0) throw new Error('The player pool is empty, so there is nobody to pick.');

      const alive = new Set(teams?.alive ?? []);
      const byes = new Set(teams?.byes ?? []);
      const candidates: Candidate[] = pool.map((player) => ({
        id: player.id, position: player.position, team: player.team,
      }));
      const worth = (player: Candidate) =>
        projectedPoints(player.position as Position, expected[player.id], EASTSIDE);

      const wanted = create ? STAND_INS.slice(0, howMany) : STAND_INS.slice(0, Math.max(present.length, 1));

      for (const [index, standIn] of wanted.entries()) {
        const uid = uidFor(index);
        if (create) await addStandIn(CONTEST, uid, { name: standIn.name, teamName: standIn.teamName });

        // What he held last round decides what he keeps, so his own history is read back each time.
        const history = round === 0 ? [] : await readHistory(CONTEST, uid, round - 1).catch(() => []);
        const previous = history[round - 1] ?? [];
        const players = pickFor(standIn.temperament, previous, candidates, alive, byes, worth);

        if (players.length === 0) {
          notes.push(`${standIn.teamName} — submits nothing (${WHY[standIn.temperament]})`);
          continue;
        }
        await writeRosterFor(CONTEST, uid, round, players);
        const kept = players.filter((held) => previous.some((was) => was.playerId === held.playerId)).length;
        notes.push(
          `${standIn.teamName} — ${players.length} in`
          + (round > 0 ? `, ${kept} kept` : '')
          + ` (${WHY[standIn.temperament]})`,
        );
      }
      setSaid(notes);
      await load();
    } catch (cause) {
      setProblem((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    if (!contest) return;
    setBusy('clear');
    setProblem(null);
    setSaid([]);
    try {
      for (const manager of present) {
        await removeStandIn(CONTEST, manager.uid, contest.rounds.length);
      }
      setSaid(['All stand-ins removed.']);
      await load();
    } catch (cause) {
      setProblem((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!contest) return <div className="card gate"><p>{problem ?? 'Loading…'}</p></div>;

  const round = contest.rounds[contest.currentRound];

  return (
    <div className="card">
      <div className="confhead">
        Stand-in managers
        <span className="colhead">{present.length} in</span>
      </div>

      <div className="pending">
        Not accounts — entries and rosters, written as you. Nobody can sign in as one. They give the
        standings, the live board and the pot a league to work on while you are still finding people.
      </div>

      <div className="editor">
        <div className="splitrow">
          <label>
            <span className="reasonlabel">How many</span>
            <input
              type="number"
              min={1}
              max={STAND_INS.length}
              value={howMany}
              onChange={(event) =>
                setHowMany(Math.min(STAND_INS.length, Math.max(1, Number(event.target.value) || 1)))}
            />
          </label>
        </div>

        <div className="inline">
          <button className="submit small" disabled={busy !== null} onClick={() => void play(true)}>
            {busy === 'add' ? 'Adding…' : `Add ${howMany} and pick`}
          </button>
          <button
            className="ghost small"
            disabled={busy !== null || present.length === 0}
            onClick={() => void play(false)}
          >
            {busy === 'play' ? 'Picking…' : `Pick ${round?.name ?? 'this round'}`}
          </button>
          <button className="danger small" disabled={busy !== null || present.length === 0} onClick={() => void clear()}>
            {busy === 'clear' ? 'Removing…' : 'Remove all'}
          </button>
        </div>
      </div>

      {problem && <p className="problem" style={{ padding: '0 16px 12px' }}>{problem}</p>}

      {said.length > 0 && (
        <div className="pending">
          {said.map((line) => <div key={line}>{line}</div>)}
        </div>
      )}
    </div>
  );
}
