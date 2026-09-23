import { useEffect, useMemo, useState } from 'react';
import { explain } from './domain/trouble.ts';
import { EASTSIDE } from './domain/rules.ts';
import type { Position } from './domain/rules.ts';
import { standingsFor } from './domain/multiplier.ts';
import type { HeldPlayer } from './domain/multiplier.ts';
import { readContest, readHistory, readPool, readTeams, recordMoves, saveRoster } from './store/firestore.ts';
import type { Move } from './store/firestore.ts';
import { PlayerRow } from './PlayerRow.tsx';
import { changed } from './domain/unsaved.ts';
import { projections } from './providers/sleeper.ts';
import { clubGames } from './providers/schedule.ts';
import type { ClubGame } from './providers/schedule.ts';
import { fixtureLabel } from './domain/fixture.ts';
import { points, projectedPoints } from './domain/scoring.ts';
import type { StatLine } from './domain/scoring.ts';
import { Breakdown } from './Breakdown.tsx';
import type { Contest, PoolPlayer, RoundTeams } from './store/firestore.ts';

/**
 * Where the game is played: nine slots, and the consequence of touching any of them.
 *
 * The rules are not restated here. Multipliers come from the same engine that scores the contest,
 * given the roster as it would be if this were submitted, so what a manager is shown before he
 * commits is what he is paid afterwards by construction rather than by agreement.
 *
 * The lock is not enforced here either. This code runs on a phone and believes whatever the phone
 * says the time is; the database refuses a late write against its own clock. What happens here is
 * only that the button goes away, which is courtesy rather than security.
 */

const CONTEST = 'rehearsal-2026';

export function RosterBuilder({
  uid,
  onBehalfOf,
  onDone,
  onUnsaved,
}: {
  uid: string;
  /** Told whenever the lineup stops or starts matching what was last submitted. */
  onUnsaved?: (unsaved: boolean) => void;
  /** Set when the commissioner is fixing somebody else's team, which ignores the lock. */
  onBehalfOf?: { name: string };
  onDone?: () => void;
}) {
  const [contest, setContest] = useState<Contest | null>(null);
  const [teams, setTeams] = useState<RoundTeams | null>(null);
  const [pool, setPool] = useState<PoolPlayer[]>([]);
  const [history, setHistory] = useState<HeldPlayer[][]>([]);
  const [roster, setRoster] = useState<HeldPlayer[]>([]);
  const [picking, setPicking] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  // What the roster looked like when it was last saved, so a submission can say what changed.
  const [baseline, setBaseline] = useState<HeldPlayer[]>([]);
  const unsaved = changed(roster, baseline);

  /**
   * Told upwards, so the app can object on the way out.
   *
   * Reported from an effect rather than from each edit: there are half a dozen ways to change a
   * lineup and every one of them would have to remember, whereas the comparison is the same
   * question however it was arrived at. Leaving the screen says no — whatever happens next, this
   * component is not the one holding the work any more.
   */
  useEffect(() => {
    onUnsaved?.(unsaved);
    return () => onUnsaved?.(false);
  }, [unsaved, onUnsaved]);
  // What each man is expected to do this week, in our scoring. The reason to pick him.
  const [projected, setProjected] = useState<Map<string, number>>(new Map());
  // The stat lines the projections came from, so a figure can be opened up and argued with.
  const [lines, setLines] = useState<Record<string, StatLine>>({});
  const [showing, setShowing] = useState<string | null>(null);
  // When each club plays, so nobody picks a man whose game is already over.
  const [games, setGames] = useState<Map<string, ClubGame>>(new Map());
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const found = await readContest(CONTEST);
        if (!found) { setProblem('No contest found.'); return; }
        const round = found.currentRound;
        const [roundTeams, board, past] = await Promise.all([
          readTeams(CONTEST, round),
          readPool(CONTEST),
          readHistory(CONTEST, uid, round),
        ]);
        setContest(found);
        setTeams(roundTeams);
        setPool(board);
        setHistory(past);

        // Already submitted this round? Show that. Otherwise carry over everyone who survived,
        // because doing nothing is a legitimate way to play a round.
        const alive = new Set(roundTeams?.alive ?? []);
        const teamOf = new Map(board.map((p) => [p.id, p.team]));
        const submitted = past[round] ?? [];
        const opening = submitted.length > 0
          ? submitted
          : (past[round - 1] ?? []).filter((held) => alive.has(teamOf.get(held.playerId) ?? ''));
        setRoster(opening);
        setBaseline(opening);

        // Projections are most use while somebody is still choosing, so they are fetched now
        // rather than once the round has shut and nothing can be done about them.
        const config = found.rounds[round];
        if (config) {
          void clubGames(found.season, config.week).then(setGames).catch(() => undefined);
          const expected = await projections(found.season, config.seasonType, config.week)
            .catch(() => ({} as Record<string, StatLine>));
          setLines(expected as Record<string, StatLine>);
          setProjected(new Map(board.map((player) => [
            player.id,
            projectedPoints(player.position as Position, (expected as Record<string, Record<string, number>>)[player.id], EASTSIDE),
          ])));
        }
      } catch (cause) {
        setProblem(explain(cause));
      }
    })();
  }, [uid]);

  const byId = useMemo(() => new Map(pool.map((player) => [player.id, player])), [pool]);
  const round = contest?.currentRound ?? 0;

  const standings = useMemo(() => {
    const past = history.slice(0, round);
    return new Map(standingsFor([...past, roster], round, EASTSIDE).map((entry) => [entry.slot, entry]));
  }, [history, roster, round]);

  if (problem) return <div className="card gate"><p className="problem">{problem}</p></div>;
  if (!contest || !teams) return <div className="card gate"><p>Loading your team…</p></div>;

  const lock = contest.locks[String(round)];
  const locked = onBehalfOf ? false : lock ? lock <= new Date() : false;
  const alive = new Set(teams.alive);
  const byes = new Set(teams.byes);
  const previous = history[round - 1] ?? [];
  const lost = previous.filter((held) => !alive.has(byId.get(held.playerId)?.team ?? ''));
  const projectedRaw = roster.reduce((sum, held) => sum + (projected.get(held.playerId) ?? 0), 0);
  const projectedCredited = roster.reduce(
    (sum, held) => sum + (projected.get(held.playerId) ?? 0) * (standings.get(held.slot)?.multiplier ?? 1),
    0,
  );
  const filled = roster.length;
  const legal = filled === EASTSIDE.slots.length;

  function choose(slotId: string, candidate: PoolPlayer) {
    setRoster((current) => [
      ...current.filter((held) => held.slot !== slotId),
      {
        playerId: candidate.id,
        position: candidate.position as Position,
        slot: slotId,
        onBye: byes.has(candidate.team),
      },
    ]);
    setPicking(null);
    setSearch('');
    setSaving('idle');
  }

  function eligibleCount(slotId: string): number {
    const slot = EASTSIDE.slots.find((entry) => entry.id === slotId)!;
    const taken = new Set(roster.filter((held) => held.slot !== slotId).map((held) => held.playerId));
    return pool.filter((player) =>
      slot.eligible.includes(player.position as Position) && alive.has(player.team) && !taken.has(player.id),
    ).length;
  }

  function candidatesFor(slotId: string): PoolPlayer[] {
    const slot = EASTSIDE.slots.find((entry) => entry.id === slotId)!;
    const taken = new Set(roster.filter((held) => held.slot !== slotId).map((held) => held.playerId));
    const query = search.trim().toLowerCase();
    return pool
      .filter((player) => slot.eligible.includes(player.position as Position))
      .filter((player) => alive.has(player.team) && !taken.has(player.id))
      .filter((player) => !query || player.name.toLowerCase().includes(query))
      .sort((first, second) => (projected.get(second.id) ?? 0) - (projected.get(first.id) ?? 0))
      .slice(0, 40);
  }

  async function submit() {
    setSaving('saving');
    try {
      await saveRoster(CONTEST, uid, round, roster);
      if (onBehalfOf) { setSaving('saved'); onDone?.(); return; }

      // What changed, so the league can see the story afterwards. The roster document is the
      // authority on what was played; this is how it got that way, which it cannot tell you.
      const before = new Set(baseline.map((held) => held.playerId));
      const after = new Set(roster.map((held) => held.playerId));
      const moves: Omit<Move, 'at'>[] = [
        ...roster.filter((held) => !before.has(held.playerId)).map((held) => ({
          uid, round, action: 'in' as const, playerId: held.playerId,
          playerName: byId.get(held.playerId)?.name ?? held.playerId, slot: held.slot,
        })),
        ...baseline.filter((held) => !after.has(held.playerId)).map((held) => ({
          uid, round, action: 'out' as const, playerId: held.playerId,
          playerName: byId.get(held.playerId)?.name ?? held.playerId, slot: held.slot,
        })),
      ];
      if (moves.length > 0 || baseline.length === 0) {
        moves.push({ uid, round, action: 'submitted', playerId: '', playerName: '', slot: '' });
        // A failure here must not look like a failed submission: the roster is already saved.
        await recordMoves(CONTEST, moves).catch(() => undefined);
      }

      setBaseline(roster);
      setSaving('saved');
    } catch (cause) {
      setSaving('failed');
      /**
       * A refusal before the lock is not a deadline, whatever it looks like.
       *
       * This used to blame the deadline for every refusal, which is how a rules bug spent days
       * telling managers the round had locked four days early — and sounded plausible enough that
       * nobody questioned it. The two cases are now told apart, so the next one surfaces as a
       * fault rather than as a lie.
       */
      setProblem(
        (cause as { code?: string }).code !== 'permission-denied' ? explain(cause)
          : locked
            ? 'The round locked before that saved, so nothing was changed.'
            : 'The database refused that, and the round has not locked — so it should have worked. '
              + 'Tell the commissioner rather than trying again.',
      );
    }
  }


  const opened = showing ? byId.get(showing) : undefined;

  return (
    <div>
      {opened && (
        <Breakdown
          name={opened.name}
          position={opened.position as Position}
          line={lines[opened.id]}
          multiplier={standings.get(roster.find((held) => held.playerId === opened.id)?.slot ?? '')?.multiplier ?? 1}
          projected
          onClose={() => setShowing(null)}
        />
      )}
      {onBehalfOf && (
        <div className="card notice">
          <strong>Editing {onBehalfOf.name}'s team.</strong> The lock does not apply to you. Putting
          a man back into a round he was already in restores his streak — it is worked out from the
          rounds he has been held, not stored, so nothing needs repairing.
        </div>
      )}

      <div className="card roundbar">
        <div>
          <strong>{contest.rounds[round]?.name}</strong>
          <span className="team"> · NFL week {contest.rounds[round]?.week}</span>
        </div>
        <div className="team">
          {locked ? 'locked' : lock ? `locks ${lock.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
        </div>
      </div>

      {lost.length > 0 && (
        <div className="card notice">
          <strong>{lost.length} of your nine are out.</strong>{' '}
          {lost.map((held) => byId.get(held.playerId)?.name ?? held.playerId).join(', ')} — their clubs lost.
          Whoever replaces them starts again at 1x.
        </div>
      )}

      <div className="rowlist">
        {EASTSIDE.slots.map((slot) => {
          const held = roster.find((entry) => entry.slot === slot.id);
          const person = held ? byId.get(held.playerId) : undefined;
          const standing = standings.get(slot.id);
          const open = picking === slot.id;
          const resting = person ? byes.has(person.team) : false;

          return (
            <div key={slot.id} className={open ? 'opened' : undefined}>
              <PlayerRow
                slot={slot.id}
                player={person ?? null}
                multiplier={standing?.multiplier ?? 1}
                hint={
                  !person ? (locked ? undefined : 'choose someone')
                    : resting ? 'resting, then 2x'
                    // Nobody has been kept in the opening round, so saying "new" nine times says nothing.
                    : round === 0
                      ? fixtureLabel(games.get(person.team))
                      : `${fixtureLabel(games.get(person.team))} · ${standing?.retained ? 'kept' : 'new'}`
                }
                card={person ? { line: lines[person.id], projected: true } : undefined}
                trailing={person && !resting ? (
                  <button
                    className="proj asked"
                    title="How this was worked out"
                    onClick={(event) => { event.stopPropagation(); setShowing(person.id); }}
                  >
                    <b>{points(projected.get(person.id) ?? 0)}</b>
                    <span className="projlabel">proj</span>
                  </button>
                ) : undefined}
                right={!locked ? (
                  <span className="rowright">
                    <button className="ghost small" onClick={(event) => {
                      event.stopPropagation();
                      setPicking(open ? null : slot.id);
                    }}>
                      {person ? 'Change' : 'Choose'}
                    </button>
                  </span>
                ) : undefined}
                onClick={() => !locked && setPicking(open ? null : slot.id)}
              />

              {open && !locked && (
                <div className="picker" ref={(node) => node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}>
                  {(() => {
                    const shown = candidatesFor(slot.id).length;
                    const all = eligibleCount(slot.id);
                    /**
                     * A search box only where searching is the only way through.
                     *
                     * Fourteen defenses fit on the screen, and a field asking which one you are
                     * looking for is then a hurdle in front of an answer already visible. Once a
                     * hundred and forty-three receivers will not fit, it earns its place — and it
                     * stays put while there is something typed in it, so it cannot vanish
                     * mid-search and strand somebody.
                     */
                    if (shown >= all && !search) {
                      return <div className="pickercount">{all} available</div>;
                    }
                    return (
                      <div className="pickerhead">
                        <span className="pickercount">Best {shown} of {all}</span>
                        <input
                          value={search}
                          placeholder={`Search ${slot.eligible.join(', ')}`}
                          onChange={(event) => setSearch(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                    );
                  })()}
                  <div className="options">
                    {candidatesFor(slot.id).map((candidate) => {
                      const incumbent = previous.some((entry) => entry.playerId === candidate.id);
                      return (
                        <PlayerRow
                          key={candidate.id}
                          player={candidate}
                          hint={
                            byes.has(candidate.team)
                              ? 'resting this round'
                              : fixtureLabel(games.get(candidate.team))
                          }
                          card={{ line: lines[candidate.id], projected: true }}
                          trailing={
                            byes.has(candidate.team) ? undefined : (
                              <button
                                className="proj asked"
                                title="How this was worked out"
                                onClick={(event) => { event.stopPropagation(); setShowing(candidate.id); }}
                              >
                                <b>{points(projected.get(candidate.id) ?? 0)}</b>
                                <span className="projlabel">proj</span>
                              </button>
                            )
                          }
                          right={<span className={incumbent ? 'keeps' : 'resets'}>{incumbent ? 'keeps streak' : '1x'}</span>}
                          onClick={() => choose(slot.id, candidate)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card total">
        <span className="totalline">
          <span className="totallabel">Projected this round</span>
          <span className="totalvalue">{points(projectedCredited)}</span>
        </span>
        <span className="totalline sub">
          <span className="totallabel">Before multipliers</span>
          <span>{points(projectedRaw)}</span>
        </span>
      </div>

      <div className="card summary">
        <span>
          {filled} of {EASTSIDE.slots.length} filled
          {saving === 'saved' && <span className="keeps"> · submitted</span>}
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
        <button disabled={!legal || locked || saving === 'saving'} className="submit" onClick={submit}>
          {locked ? 'Locked' : saving === 'saving' ? 'Saving…' : legal ? 'Submit' : `Fill ${EASTSIDE.slots.length - filled} more`}
        </button>
      </div>
    </div>
  );
}
