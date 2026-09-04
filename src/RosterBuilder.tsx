import { useMemo, useState } from 'react';
import snapshot from './data/playthrough-2024.json';
import { EASTSIDE } from './domain/rules.ts';
import { standingsFor } from './domain/multiplier.ts';
import type { HeldPlayer } from './domain/multiplier.ts';
import type { Position } from './domain/rules.ts';

/**
 * Where the game is actually played: nine slots, and the consequence of touching any of them.
 *
 * The rules are not restated here. Multipliers come from the same engine that scores the contest,
 * given the roster as it would be if the manager submitted what is on screen — so what he is shown
 * before he commits is what he will be paid afterwards, by construction rather than by agreement.
 *
 * Open on the Divisional round with a Wild Card roster behind it, because that is the screen doing
 * its real work: survivors carried over and climbing, eliminated men needing replacing at 1x.
 */

interface Candidate {
  id: string;
  name: string;
  team: string | null;
  position: string;
  form: number;
}

const POOL = snapshot.pool as Candidate[];
const LAST_ROUND = snapshot.seedRoster as HeldPlayer[];
const ROUND = 1;
const ALIVE = new Set(snapshot.teamsByRound[ROUND]);
const BY_ID = new Map(POOL.map((player) => [player.id, player]));

const teamOf = (playerId: string) => BY_ID.get(playerId)?.team ?? null;
const isAlive = (playerId: string) => {
  const team = teamOf(playerId);
  return team !== null && ALIVE.has(team);
};

export function RosterBuilder() {
  // Everyone whose club survived carries over untouched. That is the default, and doing nothing is
  // a legitimate way to play the round.
  const [roster, setRoster] = useState<HeldPlayer[]>(() => LAST_ROUND.filter((held) => isAlive(held.playerId)));
  const [picking, setPicking] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const standings = useMemo(
    () => new Map(standingsFor([LAST_ROUND, roster], ROUND, EASTSIDE).map((entry) => [entry.slot, entry])),
    [roster],
  );

  const lost = LAST_ROUND.filter((held) => !isAlive(held.playerId));
  const filled = roster.length;
  const legal = filled === EASTSIDE.slots.length;

  function choose(slotId: string, candidate: Candidate) {
    setRoster((current) => [
      ...current.filter((held) => held.slot !== slotId),
      { playerId: candidate.id, position: candidate.position as Position, slot: slotId },
    ]);
    setPicking(null);
    setSearch('');
  }

  function drop(slotId: string) {
    setRoster((current) => current.filter((held) => held.slot !== slotId));
  }

  function candidatesFor(slotId: string): Candidate[] {
    const slot = EASTSIDE.slots.find((entry) => entry.id === slotId)!;
    const taken = new Set(roster.filter((held) => held.slot !== slotId).map((held) => held.playerId));
    const query = search.trim().toLowerCase();

    return POOL.filter((player) => slot.eligible.includes(player.position as Position))
      .filter((player) => !taken.has(player.id) && isAlive(player.id))
      .filter((player) => !query || player.name.toLowerCase().includes(query))
      .slice(0, 40);
  }

  return (
    <div>
      {lost.length > 0 && (
        <div className="card notice">
          <strong>{lost.length} of your nine are out.</strong> {lost.map((held) => BY_ID.get(held.playerId)?.name ?? held.playerId).join(', ')}
          {' '}— their clubs lost. Whoever replaces them starts again at 1x.
        </div>
      )}

      <div className="card">
        {EASTSIDE.slots.map((slot) => {
          const held = roster.find((entry) => entry.slot === slot.id);
          const person = held ? BY_ID.get(held.playerId) : undefined;
          const standing = standings.get(slot.id);
          const open = picking === slot.id;

          return (
            <div key={slot.id}>
              <div className={`pick ${open ? 'open' : ''}`} onClick={() => setPicking(open ? null : slot.id)}>
                <span className="slot">{slot.id}</span>
                {person ? (
                  <>
                    <span className="who">{person.name}</span>
                    <span className="team">{person.team}</span>
                    <span className={`mult mult-${standing?.multiplier ?? 1}`}>{standing?.multiplier ?? 1}x</span>
                    <span className="hint">
                      {standing?.retained ? 'kept — climbing' : 'new — starts over'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="who empty">Empty</span>
                    <span className="team" />
                    <span className="mult mult-1">1x</span>
                    <span className="hint">choose someone</span>
                  </>
                )}
              </div>

              {open && (
                <div className="picker">
                  <input
                    autoFocus
                    value={search}
                    placeholder={`Search ${slot.eligible.join(', ')}`}
                    onChange={(event) => setSearch(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                  />
                  {held && (
                    <button className="drop" onClick={() => drop(slot.id)}>
                      Drop {person?.name} — the slot goes empty
                    </button>
                  )}
                  <div className="options">
                    {candidatesFor(slot.id).map((candidate) => {
                      const incumbent = LAST_ROUND.some((entry) => entry.playerId === candidate.id);
                      return (
                        <div className="option" key={candidate.id} onClick={() => choose(slot.id, candidate)}>
                          <span className="who">{candidate.name}</span>
                          <span className="team">
                            {candidate.position} · {candidate.team}
                          </span>
                          <span className="form">{candidate.form.toFixed(1)}</span>
                          <span className={incumbent ? 'keeps' : 'resets'}>{incumbent ? 'keeps his streak' : '1x'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card summary">
        <span>
          {filled} of {EASTSIDE.slots.length} filled
        </span>
        <span>
          {[4, 3, 2, 1].map((level) => {
            const count = [...standings.values()].filter((entry) => entry.multiplier === level).length;
            return count > 0 ? (
              <span key={level} className={`mult mult-${level}`} style={{ marginLeft: 6 }}>
                {count} at {level}x
              </span>
            ) : null;
          })}
        </span>
        <button disabled={!legal} className="submit">
          {legal ? 'Submit for the Divisional round' : `Fill ${EASTSIDE.slots.length - filled} more`}
        </button>
      </div>
    </div>
  );
}
