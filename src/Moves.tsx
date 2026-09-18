import { useEffect, useState } from 'react';
import { readContest, readEntries, readMoves, readPool } from './store/firestore.ts';
import type { Contest, Manager, Move, PoolPlayer } from './store/firestore.ts';
import { Face } from './PlayerRow.tsx';

/**
 * Who did what, and when.
 *
 * The rosters say what everybody played; this says how they got there — which the rosters cannot,
 * because a man signed and dropped again before the lock leaves no trace in them at all.
 *
 * A round at a time, and a manager at a time within it. Flat and newest-first it was a ticker: true,
 * and no use for the question anybody actually brings here, which is "what did he do this week".
 * Folded up by manager, the same list answers it in one glance and opens where you want it.
 *
 * Nothing appears until the round it belongs to has locked. Seeing that somebody has just taken
 * Barkley is seeing their team, so the rules refuse it on exactly the same terms as the rosters.
 */

const CONTEST = 'rehearsal-2026';

export function Moves() {
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [managers, setManagers] = useState<Map<string, Manager>>(new Map());
  const [players, setPlayers] = useState<Map<string, PoolPlayer>>(new Map());
  const [contest, setContest] = useState<Contest | null>(null);
  const [round, setRound] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const found = await readContest(CONTEST).catch(() => null);
      setContest(found);
      const [people, board] = await Promise.all([
        readEntries(CONTEST).catch(() => []),
        readPool(CONTEST).catch(() => []),
      ]);
      setManagers(new Map(people.map((person) => [person.uid, person])));
      setPlayers(new Map(board.map((player) => [player.id, player])));
      /*
       * The whole log if the rules allow it, and otherwise a query per round that has locked.
       *
       * A commissioner may read every move including the round being played. Everybody else may
       * not, and the rule turns on each document's own round — which Firestore will only allow a
       * query to rely on when the query pins that field to one value. So the fallback asks about
       * one round at a time.
       */
      const locked = (found?.rounds ?? [])
        .filter((entry) => (found?.locks[String(entry.round)] ?? new Date()) <= new Date())
        .map((entry) => entry.round);

      setMoves(
        await readMoves(CONTEST).catch(() =>
          locked.length === 0 ? [] : readMoves(CONTEST, locked).catch(() => []),
        ),
      );
    })();
  }, []);

  if (!moves) return <div className="card gate"><p>Loading…</p></div>;

  const real = moves.filter((move) => move.action !== 'submitted');
  if (real.length === 0) {
    return (
      <div className="card gate">
        <h2>Nothing to show yet</h2>
        <p>
          Every signing and every drop appears here — but not until the round it happened in has
          locked, or you would be able to watch people build their teams.
        </p>
      </div>
    );
  }

  const nameOfRound = (number: number) => contest?.rounds[number]?.name ?? `Round ${number + 1}`;

  // Only rounds anybody actually moved in. A tab leading to an empty screen is a worse answer than
  // no tab at all.
  const played = [...new Set(real.map((move) => move.round))].sort((first, second) => first - second);
  const showing = round !== null && played.includes(round) ? round : played[played.length - 1]!;

  const inRound = real.filter((move) => move.round === showing);

  /**
   * One group a manager, busiest first.
   *
   * Busiest rather than alphabetical because the man who made nine changes is the story of the
   * week and the two who made one each are not.
   */
  const byManager = new Map<string, Move[]>();
  for (const move of inRound) byManager.set(move.uid, [...(byManager.get(move.uid) ?? []), move]);
  const groups = [...byManager].sort((first, second) => second[1].length - first[1].length);

  return (
    <>
      {played.length > 1 && (
        <div className="card">
          <div className="races roundtabs">
            {played.map((number) => (
              <button
                key={number}
                className={number === showing ? 'on' : ''}
                onClick={() => { setRound(number); setOpen(null); }}
              >
                {nameOfRound(number)}
              </button>
            ))}
          </div>
          <div className="pending">
            {inRound.length} change{inRound.length === 1 ? '' : 's'} by {groups.length}{' '}
            {groups.length === 1 ? 'manager' : 'managers'}.
          </div>
        </div>
      )}

      {groups.map(([uid, theirs]) => {
        const manager = managers.get(uid);
        const signed = theirs.filter((move) => move.action === 'in').length;
        const dropped = theirs.length - signed;
        const expanded = open === uid;

        return (
          <div className={`card movegroup ${expanded ? 'open' : ''}`} key={uid}>
            <button
              className="movehead"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : uid)}
            >
              {manager?.logo
                ? <img className="badge small" src={manager.logo} alt="" />
                : <span className="badge small empty" />}
              <span className="rowmain">
                <span className="rowname">{manager?.teamName ?? 'Somebody'}</span>
                <span className="rowmeta">{manager?.name}</span>
              </span>
              <span className="movecount">
                {signed > 0 && <span className="arrow in">+{signed}</span>}
                {dropped > 0 && <span className="arrow out">−{dropped}</span>}
              </span>
              <span className="chev">{expanded ? '▴' : '▾'}</span>
            </button>

            {expanded && (
              <div className="movelist">
                {theirs.map((move, index) => {
                  const player = players.get(move.playerId);
                  return (
                    <div className="move" key={`${move.playerId}-${index}`}>
                      <span className={`arrow ${move.action}`}>{move.action === 'in' ? '+' : '−'}</span>
                      {player
                        ? <Face player={player} size={34} />
                        : <span className="face empty" style={{ width: 34, height: 34 }} />}
                      <span className="rowmain">
                        <span className="rowname">{move.playerName}</span>
                        <span className="rowmeta">
                          {player && <>{player.position}<span className="dot">·</span>{player.team}<span className="dot">·</span></>}
                          {move.slot}
                        </span>
                      </span>
                      <span className="movewhen">
                        {move.at.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <p className="footnote">
        Signings and drops, newest first within each manager. A round's moves appear once it has
        locked — before that, watching somebody build a team is watching their team.
      </p>
    </>
  );
}
