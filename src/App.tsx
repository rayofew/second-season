import { Fragment, useState } from 'react';
import { RosterBuilder } from './RosterBuilder.tsx';
import { SignIn, SignOut, useUser } from './Auth.tsx';
import { Bracket } from './Bracket.tsx';
import snapshot from './data/playthrough-2024.json';
import { EASTSIDE } from './domain/rules.ts';
import { display } from './domain/scoring.ts';
import type { Placing } from './domain/standings.ts';

/**
 * The standings, and the arithmetic behind them.
 *
 * Reading it is the whole design brief: a manager should be able to see why a quiet game from a
 * long held player beat a loud one from a newcomer, without being told. So every line shows the
 * raw figure, the multiplier and the product, rather than only the number that counts.
 *
 * Rendering the 2024 playthrough for now. The shapes are the real ones, so pointing this at a live
 * contest is a change of source and not of screen.
 */

interface Person {
  name: string;
  team: string | null;
  position: string;
}

const PEOPLE = snapshot.players as Record<string, Person>;
const PLACINGS = snapshot.placings as unknown as Placing[];

const points = (value: number) => display(value, EASTSIDE).toFixed(1);

function Multiplier({ value }: { value: number }) {
  return (
    <span className={`mult mult-${value}`} title={`${value} times`}>
      {value}x
    </span>
  );
}

function RoundDetail({ placing }: { placing: Placing }) {
  return (
    <div className="detail">
      {placing.rounds.map((round) => (
        <div key={round.round}>
          <h3>
            {snapshot.roundNames[round.round]} — {points(round.credited)} points
          </h3>
          {[...round.players]
            .sort((first, second) => second.credited - first.credited)
            .map((player) => {
              const person = PEOPLE[player.playerId];
              return (
                <div className="line" key={player.slot}>
                  <span className="slot">{player.slot}</span>
                  <span>{person?.name ?? player.playerId}</span>
                  <span className="team">{person?.team ?? ''}</span>
                  <Multiplier value={player.multiplier} />
                  <span className="math">
                    <span className={player.raw === 0 ? 'zero' : undefined}>{points(player.raw)}</span>
                    {' × '}
                    {player.multiplier}
                    {' = '}
                    <b>{points(player.credited)}</b>
                  </span>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

function Standings() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <div className="card scroll">
        <table>
          <thead>
            <tr>
              <th className="rank" />
              <th>Manager</th>
              {snapshot.roundNames.map((name) => (
                <th key={name}>{name}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {PLACINGS.map((placing, index) => (
              <Fragment key={placing.entryId}>
                <tr
                  className={index === 0 ? 'leader' : undefined}
                  aria-expanded={open === placing.entryId}
                  onClick={() => setOpen(open === placing.entryId ? null : placing.entryId)}
                >
                  <td className="rank">{placing.rank}</td>
                  <td>
                    {placing.name}
                    {placing.decidedBy === 'prediction' && <span className="tag">lost the tiebreaker</span>}
                  </td>
                  {placing.rounds.map((round) => (
                    <td key={round.round}>{points(round.credited)}</td>
                  ))}
                  <td className="total">{points(placing.credited)}</td>
                </tr>
                {open === placing.entryId && (
                  <tr>
                    <td colSpan={snapshot.roundNames.length + 3} style={{ padding: 0 }}>
                      <RoundDetail placing={placing} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ color: 'var(--dim)', fontSize: 13 }}>
        Tap a manager to see every round, and the multiplier behind each score.
      </p>
    </>
  );
}

export function App() {
  const [tab, setTab] = useState<'team' | 'bracket' | 'standings'>('team');
  const { user, checking } = useUser();

  return (
    <div className="wrap">
      <header>
        <div className="topline">
          <h1>Second Season</h1>
          {user && <SignOut user={user} />}
        </div>
        <p>
          {snapshot.season} postseason · {PLACINGS.length} managers · byes {snapshot.byeTeams.join(', ')}
        </p>
      </header>

      {checking ? null : !user ? <SignIn /> : <>
      <nav>
        <button aria-current={tab === 'team'} onClick={() => setTab('team')}>My Team</button>
        <button aria-current={tab === 'bracket'} onClick={() => setTab('bracket')}>Bracket</button>
        <button aria-current={tab === 'standings'} onClick={() => setTab('standings')}>Standings</button>
      </nav>

      {tab === 'team' ? <RosterBuilder /> : tab === 'bracket' ? <Bracket /> : <Standings />}
      </>}
    </div>
  );
}
