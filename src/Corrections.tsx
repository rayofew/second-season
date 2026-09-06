import { useEffect, useState } from 'react';
import { readCorrections, readPool, readScores, setCorrection } from './store/firestore.ts';
import type { Contest, Correction, PoolPlayer } from './store/firestore.ts';
import { EASTSIDE } from './domain/rules.ts';
import { display, rawPoints } from './domain/scoring.ts';
import type { StatLine } from './domain/scoring.ts';
import type { Position } from './domain/rules.ts';
import { Face } from './PlayerRow.tsx';

/**
 * Setting a figure by hand when the data is wrong.
 *
 * The correction is stored beside the import rather than over it: re-running the scoring job would
 * silently undo an edit written into the statistics, and "the provider said 12.4 and I made it
 * 18.4" is a different fact from "it was always 18.4".
 *
 * A reason is required. A number somebody changed for a forgotten reason is worse than the number
 * they changed it from, and in February it is the only thing anybody will ask about.
 */

const CONTEST = 'rehearsal-2026';

export function Corrections({ contest, by }: { contest: Contest; by: string }) {
  const [round, setRound] = useState(contest.currentRound);
  const [pool, setPool] = useState<PoolPlayer[]>([]);
  const [imported, setImported] = useState<Record<string, number>>({});
  const [fixes, setFixes] = useState<Record<string, Correction>>({});
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<PoolPlayer | null>(null);
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function load(forRound: number) {
    const [board, scores, corrections] = await Promise.all([
      readPool(CONTEST).catch(() => []),
      readScores(CONTEST, forRound).catch(() => ({}) as Record<string, StatLine>),
      readCorrections(CONTEST, forRound).catch(() => ({})),
    ]);
    setPool(board);
    setFixes(corrections);
    setImported(Object.fromEntries(board.map((player) => [
      player.id,
      rawPoints(player.position as Position, scores[player.id], EASTSIDE),
    ])));
  }

  useEffect(() => { void load(round); }, [round]);

  async function save(remove = false) {
    if (!chosen) return;
    if (!remove && !reason.trim()) {
      setProblem('Say why. In February it is the only thing anybody asks.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const update = remove ? null : { raw: Number(points) || 0, reason: reason.trim(), by };
      await setCorrection(CONTEST, round, chosen.id, update);
      setChosen(null);
      setPoints('');
      setReason('');
      setSearch('');
      await load(round);
    } catch (cause) {
      setProblem((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const matches = search.trim().length < 2
    ? []
    : pool.filter((player) => player.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8);

  return (
    <div className="card">
      <div className="confhead">Correct a score</div>

      <div className="editor">
        <label className="inline">
          Round
          <select value={round} onChange={(event) => setRound(Number(event.target.value))}>
            {contest.rounds.map((entry) => (
              <option key={entry.round} value={entry.round}>{entry.name}</option>
            ))}
          </select>
        </label>

        {chosen ? (
          <>
            <div className="row">
              <Face player={chosen} size={38} />
              <span className="rowmain">
                <span className="rowname">{chosen.name}</span>
                <span className="rowmeta">
                  {chosen.position} · {chosen.team} · imported{' '}
                  {display(imported[chosen.id] ?? 0, EASTSIDE).toFixed(1)}
                </span>
              </span>
              <button className="ghost small" onClick={() => setChosen(null)}>Change</button>
            </div>

            <label className="inline">
              Raw points
              <input
                type="number" inputMode="decimal" style={{ width: 92 }}
                value={points}
                onChange={(event) => setPoints(event.target.value)}
              />
            </label>

            <label>
              <span className="reasonlabel">Why</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Sleeper missed his second touchdown"
              />
            </label>

            {problem && <p className="problem">{problem}</p>}

            <div className="summary">
              <span className="team">Applies to everyone who held him.</span>
              <span className="actions">
                {fixes[chosen.id] && (
                  <button className="danger small" disabled={busy} onClick={() => void save(true)}>
                    Remove
                  </button>
                )}
                <button className="submit small" disabled={busy} onClick={() => void save()}>
                  {busy ? '…' : 'Set it'}
                </button>
              </span>
            </div>
          </>
        ) : (
          <>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search for the player"
            />
            {matches.map((player) => (
              <div
                className="row"
                key={player.id}
                onClick={() => {
                  setChosen(player);
                  setPoints(String(display(fixes[player.id]?.raw ?? imported[player.id] ?? 0, EASTSIDE)));
                  setReason(fixes[player.id]?.reason ?? '');
                }}
              >
                <Face player={player} size={38} />
                <span className="rowmain">
                  <span className="rowname">{player.name}</span>
                  <span className="rowmeta">
                    {player.position} · {player.team} · {display(imported[player.id] ?? 0, EASTSIDE).toFixed(1)}
                    {fixes[player.id] && <span className="fixed">corrected</span>}
                  </span>
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {Object.keys(fixes).length > 0 && (
        <>
          <div className="confhead">Corrected this round</div>
          {Object.entries(fixes).map(([playerId, fix]) => {
            const player = pool.find((candidate) => candidate.id === playerId);
            return (
              <div className="row" key={playerId}>
                {player && <Face player={player} size={38} />}
                <span className="rowmain">
                  <span className="rowname">{player?.name ?? playerId}</span>
                  <span className="rowmeta">
                    {display(imported[playerId] ?? 0, EASTSIDE).toFixed(1)} →{' '}
                    {display(fix.raw, EASTSIDE).toFixed(1)} · {fix.reason}
                  </span>
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
