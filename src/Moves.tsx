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
 * Nothing appears until the round it belongs to has locked. Seeing that somebody has just taken
 * Barkley is seeing their team, so the rules refuse it on exactly the same terms as the rosters
 * themselves.
 */

const CONTEST = 'rehearsal-2026';

export function Moves() {
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [managers, setManagers] = useState<Map<string, Manager>>(new Map());
  const [players, setPlayers] = useState<Map<string, PoolPlayer>>(new Map());
  const [contest, setContest] = useState<Contest | null>(null);

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
      // Refused for rounds still open, which is the point rather than a failure.
      setMoves(await readMoves(CONTEST).catch(() => []));
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

  const nameOfRound = (round: number) => contest?.rounds[round]?.name ?? `Round ${round + 1}`;
  let lastRound: number | null = null;

  return (
    <>
      {real.map((move, index) => {
        const manager = managers.get(move.uid);
        const player = players.get(move.playerId);
        const header = move.round !== lastRound;
        lastRound = move.round;

        return (
          <div key={`${move.uid}-${move.playerId}-${index}`}>
            {header && <div className="movesround">{nameOfRound(move.round)}</div>}
            <div className="card move">
              <span className={`arrow ${move.action}`}>{move.action === 'in' ? '+' : '−'}</span>
              {player
                ? <Face player={player} size={38} />
                : <span className="face empty" style={{ width: 38, height: 38 }} />}
              <span className="rowmain">
                <span className="rowname">{move.playerName}</span>
                <span className="rowmeta">
                  {player && <>{player.position}<span className="dot">·</span>{player.team}<span className="dot">·</span></>}
                  {move.slot}
                </span>
              </span>
              <span className="rowmeta movewho">
                {manager?.teamName ?? 'somebody'}
                <br />
                <span className="movewhen">
                  {move.at.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </span>
            </div>
          </div>
        );
      })}
      <p className="footnote">
        Signings and drops, newest first. A round's moves appear once it has locked.
      </p>
    </>
  );
}
