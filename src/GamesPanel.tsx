import { useEffect, useState } from 'react';
import { createGame, gameIdFor, readGames, saveGames } from './store/firestore.ts';
import type { Game } from './store/firestore.ts';
import { EASTSIDE } from './domain/rules.ts';
import { explain } from './domain/trouble.ts';

/**
 * The games the site runs, and which of them players can see.
 *
 * Ray: "low and high names ... should be in the commish tab, as well as a tick box for me to be
 * able to enable it. in fact i should be able to run as many games as i want, so maybe a plus minus
 * key." Plus makes a new, empty game, switched off. The tick box shows it to players, and opens it
 * for sign-ups until its first lock. Minus takes it off the list: nothing in it is deleted, and
 * adding a game with the same name brings it straight back.
 *
 * Owner only. The rules refuse anybody else a write to the list, whatever this screen shows.
 */
export function GamesPanel({ uid, onChange }: { uid: string; onChange: () => void }) {
  const [games, setGames] = useState<Game[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => { void readGames().then(setGames); }, []);

  async function save(next: Game[]) {
    setBusy(true);
    setProblem(null);
    try {
      await saveGames(next);
      setGames(next);
      onChange();
    } catch (cause) {
      setProblem(explain(cause));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  async function add() {
    const label = name.trim();
    if (!label || !games) return;
    // Named for the January it is played in: the 2026 season's playoffs are January 2027.
    const season = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const id = gameIdFor(label, season + 1);
    if (games.some((game) => game.id === id)) { setProblem(`There is already a game called ${label}.`); return; }
    setBusy(true);
    setProblem(null);
    try {
      // A game removed from the list keeps its contest, so adding it again only puts it back.
      await createGame(id, label, uid, EASTSIDE, season);
      setName('');
      await save([...games, { id, name: label, enabled: false }]);
    } catch (cause) {
      setProblem(explain(cause));
      setBusy(false);
    }
  }

  if (!games) return <div className="card gate"><p>Loading the games…</p></div>;

  return (
    <div className="card">
      <div className="confhead">Games<span className="colhead">{games.filter((game) => game.enabled).length} on</span></div>
      <div className="pending">
        Each game is its own contest: its own teams, bracket, standings and money. Ticked games are shown to
        players and open for sign-ups until their first lock. Unticked ones only you can see.
      </div>

      {games.map((game, index) => (
        <div className="row gamerow" key={game.id}>
          <label className="gametick">
            <input
              type="checkbox" checked={game.enabled} disabled={busy}
              onChange={() => void save(games.map((each) => (each.id === game.id ? { ...each, enabled: !each.enabled } : each)))}
            />
            <span className="sr">{game.enabled ? 'On' : 'Off'}</span>
          </label>
          <span className="rowmain">
            <input
              className="gamename" defaultValue={game.name} key={game.name} disabled={busy} aria-label="Game name"
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next && next !== game.name) void save(games.map((each, at) => (at === index ? { ...each, name: next } : each)));
              }}
            />
            <span className="rowmeta">{game.id} · {game.enabled ? 'shown to players' : 'hidden'}</span>
          </span>
          {games.length > 1 && (
            <button
              className="danger small" disabled={busy} aria-label={`Remove ${game.name}`}
              onClick={() => (confirming === game.id ? void save(games.filter((each) => each.id !== game.id)) : setConfirming(game.id))}
            >{confirming === game.id ? 'Sure?' : '−'}</button>
          )}
        </div>
      ))}

      <div className="row gamerow">
        <span className="rowmain">
          <input
            className="gamename" placeholder="New game, e.g. High Stakes" value={name} disabled={busy}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void add(); }}
          />
        </span>
        <button className="submit small" disabled={busy || !name.trim()} onClick={() => void add()} aria-label="Add a game">+</button>
      </div>

      {problem && <p className="problem">{problem}</p>}
      <div className="pending">
        A new game starts empty. Its player pool and bracket are set up by the setup scripts in January, once
        the playoff field is known — run them with GAME set to the id shown under the game&apos;s name.
      </div>
    </div>
  );
}
