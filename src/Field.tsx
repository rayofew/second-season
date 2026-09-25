import { useState } from 'react';
import { EASTSIDE } from './domain/rules.ts';
import { Face } from './PlayerRow.tsx';
import type { HeldPlayer } from './domain/multiplier.ts';
import type { Manager, PoolPlayer } from './store/firestore.ts';

/**
 * Who else is playing, and what they are left with.
 *
 * People join these things because they can see their brother-in-law already has. Until now a
 * manager signed in and saw a number in the header and nothing else — no names, no badges, no
 * sense that anybody was coming.
 *
 * Pressing a name opens the last team they actually played, with the men whose clubs are out
 * crossed off. That is the useful question between rounds: not what somebody has now, but what
 * they are short of — three empty slots at receiver says more about Thursday than any projection.
 *
 * Last round's team rather than this week's, and that is the rule rather than a shortcut. Nobody
 * sees anybody's current picks until the lock, because seeing what somebody chose while there is
 * still time to copy it is the one thing the whole schedule protects against. The database refuses
 * it, so there is nothing here that could leak even if this screen asked.
 */

export function Field({
  managers,
  you,
  rosters,
  pool,
  alive,
  roundName,
  live,
}: {
  managers: Manager[];
  you: string;
  /** Last locked round's teams, by manager. Empty before anything has locked. */
  rosters?: Map<string, HeldPlayer[]>;
  pool?: Map<string, PoolPlayer>;
  /** Clubs still in the contest. Anybody else's man is gone and his slot is open. */
  alive?: Set<string>;
  /** The round those teams were played in, so the card can say which one it is showing. */
  roundName?: string;
  /** Whether that round is the one being played, which changes what the card is saying. */
  live?: boolean;
}) {
  const [showing, setShowing] = useState<string | null>(null);
  if (managers.length === 0) return null;

  // Yourself first, then everybody else as they joined, so the list reads as "me and these people".
  const ordered = [
    ...managers.filter((manager) => manager.uid === you),
    ...managers.filter((manager) => manager.uid !== you),
  ];

  const open = managers.find((manager) => manager.uid === showing);
  const theirs = showing ? rosters?.get(showing) ?? [] : [];

  /** Every slot, in the order they are played, with whoever held it and whether he survived. */
  const lineup = EASTSIDE.slots.map((slot) => {
    const held = theirs.find((entry) => entry.slot === slot.id);
    const person = held ? pool?.get(held.playerId) : undefined;
    const out = person ? !(alive?.has(person.team) ?? true) : false;
    return { slot: slot.id, person, out, missing: !held };
  });

  const needed = lineup.filter((entry) => entry.out || entry.missing);

  return (
    <div className="card">
      <div className="confhead">
        In the league
        <span className="colhead">{managers.length} {managers.length === 1 ? 'manager' : 'managers'}</span>
      </div>

      <div className="fieldgrid">
        {ordered.map((manager) => {
          const known = (rosters?.get(manager.uid)?.length ?? 0) > 0;
          return (
            <button
              className={`fieldone ${manager.uid === you ? 'me' : ''} ${showing === manager.uid ? 'open' : ''}`}
              key={manager.uid}
              disabled={!known}
              aria-expanded={showing === manager.uid}
              onClick={() => setShowing(showing === manager.uid ? null : manager.uid)}
            >
              {manager.logo
                ? <img className="badge small" src={manager.logo} alt="" />
                : <span className="badge small empty" />}
              <span className="fieldnames">
                <span className="fieldteam">{manager.teamName}</span>
                <span className="fieldwho">{manager.uid === you ? 'you' : manager.name}</span>
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="squadcard">
          <div className="squadtop">
            <strong>{open.teamName}</strong>
            <span className="squadwhen">
              {live
                ? `playing in ${roundName ?? 'this round'}`
                : `as played in ${roundName ?? 'the last round'}`}
            </span>
          </div>

          {/* Before the lock this is what he has to fix; after it, what he never fixed. */}
          {needed.length > 0 ? (
            <div className="squadneeds">
              {live
                ? `Playing ${lineup.length - needed.length} of ${lineup.length} — ${needed.map((entry) => entry.slot).join(', ')} empty`
                : `Needs ${needed.map((entry) => entry.slot).join(', ')}`}
            </div>
          ) : (
            <div className="squadneeds whole">
              {live ? 'A full nine in.' : 'Nobody to replace — all nine survived.'}
            </div>
          )}

          <div className="squadlist">
            {lineup.map((entry) => (
              <div className={`squadrow ${entry.out ? 'out' : ''} ${entry.missing ? 'gap' : ''}`} key={entry.slot}>
                <span className="squadslot">{entry.slot}</span>
                {entry.person ? (
                  <>
                    <Face player={entry.person} size={28} />
                    <span className="squadname">{entry.person.name}</span>
                    <span className="squadclub">{entry.person.team}</span>
                    {entry.out && <span className="squadout">out</span>}
                  </>
                ) : (
                  <span className="squadname empty">nobody</span>
                )}
              </div>
            ))}
          </div>

          <div className="pending">
            {live
              ? 'Everybody’s team for the round being played. Rosters open to the league at the first kickoff and not a moment before.'
              : 'What they had last round. Nobody sees anybody’s picks for the round being played until it locks — which is why there is still a point in thinking about yours.'}
          </div>
        </div>
      )}

      {managers.length < 4 && (
        <div className="pending">
          Still filling up. Anybody you send the link to lands on the same screen you did.
        </div>
      )}
    </div>
  );
}
