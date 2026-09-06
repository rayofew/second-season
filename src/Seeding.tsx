import { useState } from 'react';
import { reseed } from './domain/advance.ts';
import { colorOf, crest } from './domain/clubs.ts';
import { setField, setRoundTeams } from './store/firestore.ts';
import type { Contest } from './store/firestore.ts';

/**
 * Setting the seeding by hand.
 *
 * The seeds came out of a real season's standings, which stopped mattering the moment this became
 * an invented bracket. They still decide two things that matter: who rests in the first round, and
 * who a tie falls to when nothing else separates two clubs.
 *
 * Redrawing rebuilds the first round from the order — top seed rests, then two against seven, three
 * against six, four against five. It only offers to do that before the round has locked, because a
 * redraw after people have picked would change which clubs their players belong to.
 */

const CONTEST = 'rehearsal-2026';

export function Seeding({ contest, locked, onChange }: { contest: Contest; locked: boolean; onChange: () => void }) {
  const [order, setOrder] = useState<Record<string, string[]>>(() => {
    const byConference: Record<string, string[]> = { AFC: [], NFC: [] };
    for (const [club, seeding] of Object.entries(contest.field ?? {})) {
      (byConference[seeding.conference] ??= []).push(club);
    }
    for (const conference of Object.keys(byConference)) {
      byConference[conference]!.sort((a, b) => contest.field[a]!.seed - contest.field[b]!.seed);
    }
    return byConference;
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function move(conference: string, index: number, by: number) {
    setOrder((current) => {
      const clubs = [...(current[conference] ?? [])];
      const to = index + by;
      if (to < 0 || to >= clubs.length) return current;
      [clubs[index], clubs[to]] = [clubs[to]!, clubs[index]!];
      return { ...current, [conference]: clubs };
    });
    setSaved(false);
  }

  async function save(redraw: boolean) {
    setBusy(true);
    try {
      const field: Record<string, { conference: string; seed: number }> = {};
      for (const [conference, clubs] of Object.entries(order)) {
        clubs.forEach((club, index) => { field[club] = { conference, seed: index + 1 }; });
      }
      await setField(CONTEST, field);

      if (redraw) {
        // Top seed in each conference rests; the rest pair 2v7, 3v6, 4v5 — which is what reseed
        // does with the survivors, given the men who are not resting.
        const byes = Object.values(order).map((clubs) => clubs[0]!).filter(Boolean);
        const playing = Object.values(order).flatMap((clubs) => clubs.slice(1));
        await setRoundTeams(CONTEST, 0, {
          alive: Object.keys(field),
          byes,
          matchups: reseed(playing, field),
        });
      }
      setSaved(true);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="confhead">Seeding</div>

      {locked && (
        <div className="notice flat">
          <strong>The first round has locked.</strong> Changing the order now will not redraw it —
          people have already picked players from these clubs.
        </div>
      )}

      {['AFC', 'NFC'].map((conference) => (
        <div key={conference}>
          <div className="confhead">{conference}</div>
          {(order[conference] ?? []).map((club, index) => (
            <div className="seedrow" key={club}>
              <span className="seed">{index + 1}</span>
              <img className="clubcrest" src={crest(club)} alt="" width="24" height="24" />
              <span className="club" style={{ color: colorOf(club) }}>{club}</span>
              <span className="team">{index === 0 ? 'rests in round one' : ''}</span>
              <span className="actions">
                <button className="ghost small" disabled={index === 0} onClick={() => move(conference, index, -1)}>↑</button>
                <button className="ghost small" disabled={index === (order[conference]?.length ?? 0) - 1} onClick={() => move(conference, index, 1)}>↓</button>
              </span>
            </div>
          ))}
        </div>
      ))}

      <div className="summary">
        <span>{saved ? 'Saved.' : 'Top seed rests; then 2 v 7, 3 v 6, 4 v 5.'}</span>
        <span className="actions">
          <button className="ghost small" disabled={busy} onClick={() => void save(false)}>Save order</button>
          {!locked && (
            <button className="submit small" disabled={busy} onClick={() => void save(true)}>
              {busy ? '…' : 'Save and redraw'}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
