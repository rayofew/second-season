import { useCallback, useEffect, useState } from 'react';
import { explain } from './domain/trouble.ts';
import { EASTSIDE } from './domain/rules.ts';
import type { Position } from './domain/rules.ts';
import { pickFor, STAND_INS, STAND_IN_PREFIX, tasteOf, uidFor, WHY } from './domain/standin.ts';
import type { Candidate, StandIn, Temperament } from './domain/standin.ts';
import { projectedPoints } from './domain/scoring.ts';
import type { StatLine } from './domain/scoring.ts';
import { projections } from './providers/sleeper.ts';
import { standingsFor } from './domain/multiplier.ts';
import type { HeldPlayer } from './domain/multiplier.ts';
import { PlayerRow } from './PlayerRow.tsx';
import {
  addStandIn, readContest, readEntries, readHistory, readPool, readTeams, removeStandIn, writeRosterFor,
} from './store/firestore.ts';
import type { Contest, Manager, PoolPlayer } from './store/firestore.ts';

/**
 * A field of managers who do not exist, named by hand.
 *
 * Six testers who never reply is what blocks every screen needing more than one team in it, and
 * fake logins would only test the login. The rules already let a commissioner create an entry and
 * write anybody's roster, so this needs no service account key and no accounts.
 *
 * The names are typed in rather than invented here, because whoever runs this knows what a
 * plausible name looks like in his own league and a list written in advance never will.
 *
 * The temperament is the part that matters and the part not worth typing: it decides whether a
 * manager keeps his men or chases points, and it is kept on the entry so his character survives
 * between rounds. One who never lets go against one who chases the best projection every week is
 * the whole thesis of the format, played out where it can be watched.
 */

const CONTEST = 'rehearsal-2026';

/** One stand-in's nine for the open round, with what each man is currently worth to him. */
interface Lineup {
  uid: string;
  teamName: string;
  players: HeldPlayer[];
  multipliers: Map<string, number>;
}

const TEMPERAMENTS: Temperament[] = ['loyal', 'chaser', 'patcher', 'fiddler', 'absent'];

export function StandIns() {
  const [contest, setContest] = useState<Contest | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [rows, setRows] = useState<StandIn[]>(STAND_INS.slice(0, 6));
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pool, setPool] = useState<Map<string, PoolPlayer>>(new Map());
  const [lineups, setLineups] = useState<Lineup[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const found = await readContest(CONTEST);
      setContest(found);
      const people = await readEntries(CONTEST);
      setManagers(people);

      // Anybody already in comes back into the form, so the names can be corrected rather than
      // only ever added. Ordered by uid so row three is always stand-in-3.
      const existing = people
        .filter((manager) => manager.uid.startsWith(STAND_IN_PREFIX))
        .sort((first, second) => first.uid.localeCompare(second.uid, undefined, { numeric: true }));
      if (existing.length > 0) {
        setRows(existing.map((manager, index) => ({
          name: manager.name,
          teamName: manager.teamName,
          temperament: (manager.temperament as Temperament) ?? STAND_INS[index]?.temperament ?? 'patcher',
        })));
      }

      if (!found || existing.length === 0) {
        setLineups([]);
        return;
      }

      // A commissioner may read anybody's roster at any time, which is the only reason this can
      // show a team before the lock that hides it from everybody else.
      const round = found.currentRound;
      const board = await readPool(CONTEST).catch(() => []);
      setPool(new Map(board.map((player) => [player.id, player])));
      setLineups(await Promise.all(existing.map(async (manager) => {
        const history = await readHistory(CONTEST, manager.uid, round).catch(() => []);
        const players = history[round] ?? [];
        const standing = standingsFor(history, round, EASTSIDE);
        return {
          uid: manager.uid,
          teamName: manager.teamName,
          players,
          multipliers: new Map(standing.map((entry) => [entry.slot, entry.multiplier])),
        };
      })));
    } catch (cause) {
      setProblem(explain(cause));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const present = managers.filter((manager) => manager.uid.startsWith(STAND_IN_PREFIX));

  const change = (index: number, patch: Partial<StandIn>) =>
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  const addRow = () =>
    setRows((current) => [
      ...current,
      STAND_INS[current.length] ?? { name: '', teamName: '', temperament: 'patcher' },
    ]);

  const dropRow = (index: number) => setRows((current) => current.filter((_, at) => at !== index));

  /**
   * Writes the entries and picks a roster for each, for the round that is open.
   *
   * Run again after advancing and every one behaves in character against the new field, so the
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

      const playing: StandIn[] = create
        ? rows.map((row, index) => ({
            name: row.name.trim() || `Manager ${index + 1}`,
            teamName: row.teamName.trim() || row.name.trim() || `Team ${index + 1}`,
            temperament: row.temperament,
          }))
        // Picking without adding uses whoever is actually in, and the character stored on each.
        : present
            .sort((first, second) => first.uid.localeCompare(second.uid, undefined, { numeric: true }))
            .map((manager, index) => ({
              name: manager.name,
              teamName: manager.teamName,
              temperament: (manager.temperament as Temperament) ?? STAND_INS[index]?.temperament ?? 'patcher',
            }));

      for (const [index, standIn] of playing.entries()) {
        const uid = uidFor(index);
        if (create) await addStandIn(CONTEST, uid, standIn);

        const history = round === 0 ? [] : await readHistory(CONTEST, uid, round - 1).catch(() => []);
        const previous = history[round - 1] ?? [];
        // His own view of the pool, so six managers do not arrive at one team between them.
        const players = pickFor(
          standIn.temperament, previous, candidates, alive, byes, tasteOf(index + 1, worth),
        );

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
      setProblem(explain(cause));
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
      setRows(STAND_INS.slice(0, 6));
      setSaid(['All stand-ins removed.']);
      await load();
    } catch (cause) {
      setProblem(explain(cause));
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
        Not accounts — entries and rosters, written as you. Nobody can sign in as one. They read as
        ordinary managers to everybody else, and carry a <strong>stand-in</strong> tag in your own
        list under Commish so you can always tell which of your league is real. Take them out before
        the round that counts.
      </div>

      <div className="standins">
        {rows.map((row, index) => (
          <div className="standin" key={index}>
            <input
              value={row.name}
              placeholder="Name"
              onChange={(event) => change(index, { name: event.target.value })}
            />
            <input
              value={row.teamName}
              placeholder="Team name"
              onChange={(event) => change(index, { teamName: event.target.value })}
            />
            <select
              value={row.temperament}
              title={WHY[row.temperament]}
              onChange={(event) => change(index, { temperament: event.target.value as Temperament })}
            >
              {TEMPERAMENTS.map((temperament) => (
                <option key={temperament} value={temperament}>{temperament}</option>
              ))}
            </select>
            <button className="danger small" onClick={() => dropRow(index)} title="Remove this row">
              ×
            </button>
            <span className="standinwhy">{WHY[row.temperament]}</span>
          </div>
        ))}

        <button className="ghost small" onClick={addRow} disabled={rows.length >= 20}>
          Add another
        </button>
      </div>

      <div className="editor">
        <div className="inline">
          <button className="submit small" disabled={busy !== null || rows.length === 0} onClick={() => void play(true)}>
            {busy === 'add' ? 'Saving…' : `Put ${rows.length} in and pick`}
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

      {lineups.length > 0 && (
        <div className="lineups">
          {lineups.map((lineup) => (
            <div key={lineup.uid}>
              <button
                className={`lineuphead ${open === lineup.uid ? 'on' : ''}`}
                onClick={() => setOpen(open === lineup.uid ? null : lineup.uid)}
              >
                <span className="lineupname">{lineup.teamName}</span>
                <span className="lineupmeta">
                  {lineup.players.length === 0
                    ? 'nothing submitted'
                    : `${lineup.players.length} in`}
                  {lineup.players.length > 0 && (() => {
                    const top = Math.max(...[...lineup.multipliers.values()], 1);
                    return <span className={`mult mult-${top}`}>{top}x</span>;
                  })()}
                </span>
              </button>
              {open === lineup.uid && lineup.players.length > 0 && (
                <div className="lineupteam">
                  {EASTSIDE.slots.map((slot) => {
                    const held = lineup.players.find((entry) => entry.slot === slot.id);
                    return (
                      <PlayerRow
                        key={slot.id}
                        slot={slot.id}
                        player={held ? (pool.get(held.playerId) ?? null) : null}
                        multiplier={lineup.multipliers.get(slot.id) ?? 1}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
