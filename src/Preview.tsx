import { PlayerRow } from './PlayerRow.tsx';
import type { RowPlayer } from './PlayerRow.tsx';
import { BracketLadder } from './Bracket.tsx';
import { Rules } from './Rules.tsx';
import type { Contest, RoundTeams } from './store/firestore.ts';
import { EASTSIDE } from './domain/rules.ts';

/**
 * A design harness, reachable at ?preview and nothing else.
 *
 * Every screen that matters sits behind a Google sign-in, which makes iterating on the look of it
 * slow and blind. This renders the same components against invented players so the layout can be
 * judged without an account. It reads nothing and writes nothing — there is no path from here to
 * the league's data, and the security rules would refuse it anyway.
 */

const MOCK: Record<string, RowPlayer> = {
  purdy: { id: '8183', name: 'Brock Purdy', position: 'QB', team: 'SF' },
  cmc: { id: '4034', name: 'Christian McCaffrey', position: 'RB', team: 'SF' },
  cook: { id: '8138', name: 'James Cook', position: 'RB', team: 'BUF' },
  nacua: { id: '9493', name: 'Puka Nacua', position: 'WR', team: 'LAR' },
  jsn: { id: '9488', name: 'Jaxon Smith-Njigba', position: 'WR', team: 'SEA' },
  kittle: { id: '4217', name: 'George Kittle', position: 'TE', team: 'SF' },
  barkley: { id: '4866', name: 'Saquon Barkley', position: 'RB', team: 'PHI' },
  myers: { id: '2747', name: 'Jason Myers', position: 'K', team: 'SEA' },
  seahawks: { id: 'SEA', name: 'Seahawks', position: 'DEF', team: 'SEA' },
};


const FIELD = {
  DEN: { conference: 'AFC', seed: 1 }, NE: { conference: 'AFC', seed: 2 },
  JAX: { conference: 'AFC', seed: 3 }, PIT: { conference: 'AFC', seed: 4 },
  BUF: { conference: 'AFC', seed: 5 }, HOU: { conference: 'AFC', seed: 6 },
  LAC: { conference: 'AFC', seed: 7 },
  SEA: { conference: 'NFC', seed: 1 }, PHI: { conference: 'NFC', seed: 2 },
  CHI: { conference: 'NFC', seed: 3 }, TB: { conference: 'NFC', seed: 4 },
  LAR: { conference: 'NFC', seed: 5 }, SF: { conference: 'NFC', seed: 6 },
  GB: { conference: 'NFC', seed: 7 },
};

const CONTEST: Contest = {
  name: 'Second Season — Rehearsal', season: 2026, currentRound: 1, status: 'open', settings: EASTSIDE,
  commissioners: [], field: FIELD,
  rounds: [
    { round: 0, name: 'Wild Card', seasonType: 'regular', week: 2, status: 'final' },
    { round: 1, name: 'Divisional', seasonType: 'regular', week: 3, status: 'open' },
    { round: 2, name: 'Conference', seasonType: 'regular', week: 4, status: 'upcoming' },
    { round: 3, name: 'Super Bowl', seasonType: 'regular', week: 5, status: 'upcoming' },
  ],
  locks: { '0': new Date(Date.now() - 8.64e7), '1': new Date(Date.now() + 8.64e7), '2': new Date(), '3': new Date() },
};

const LADDER: (RoundTeams | null)[] = [
  {
    alive: Object.keys(FIELD), byes: ['DEN', 'SEA'],
    matchups: [
      { home: 'NE', away: 'LAC', winner: 'NE' },
      { home: 'JAX', away: 'HOU', winner: 'JAX' },
      { home: 'PIT', away: 'BUF', winner: 'BUF' },
      { home: 'PHI', away: 'GB', winner: 'GB' },
      { home: 'CHI', away: 'SF', winner: 'SF' },
      { home: 'TB', away: 'LAR', winner: 'LAR' },
    ],
  },
  {
    alive: ['DEN', 'NE', 'JAX', 'BUF', 'SEA', 'GB', 'SF', 'LAR'], byes: [],
    matchups: [
      { home: 'DEN', away: 'BUF', winner: null },
      { home: 'NE', away: 'JAX', winner: null },
      { home: 'SEA', away: 'GB', winner: null },
      { home: 'LAR', away: 'SF', winner: null },
    ],
  },
  null,
  null,
];

const ROSTER = [
  { slot: 'QB', player: MOCK.purdy!, multiplier: 2, hint: 'kept' },
  { slot: 'RB1', player: MOCK.cmc!, multiplier: 3, hint: 'kept' },
  { slot: 'RB2', player: MOCK.cook!, multiplier: 1, hint: 'new' },
  { slot: 'WR1', player: MOCK.nacua!, multiplier: 4, hint: 'kept' },
  { slot: 'WR2', player: MOCK.jsn!, multiplier: 2, hint: 'resting' },
  { slot: 'TE', player: MOCK.kittle!, multiplier: 2, hint: 'kept' },
  { slot: 'FLEX', player: MOCK.barkley!, multiplier: 4, hint: 'kept' },
  { slot: 'K', player: null, multiplier: 1, hint: undefined },
  { slot: 'DEF', player: MOCK.seahawks!, multiplier: 3, hint: 'resting' },
];

export function Preview() {
  return (
    <div className="wrap">
      <header>
        <div className="topline">
          <div className="brand">
            <img src="/crest-96.png" alt="" width="40" height="40" />
            <h1>Second Season</h1>
          </div>
        </div>
        <p>Design preview · invented players · no data</p>
      </header>

      <div className="card roundbar">
        <div><strong>Divisional</strong><span className="team"> · NFL week 3</span></div>
        <div className="team">locks Thu 5:15 PM</div>
      </div>

      <div className="card">
        {ROSTER.map((entry) => (
          <PlayerRow
            key={entry.slot}
            slot={entry.slot}
            player={entry.player}
            multiplier={entry.multiplier}
            hint={entry.hint}
          />
        ))}
      </div>

      <div className="card summary">
        <span>9 of 9 filled</span>
        <span>
          <span className="mult mult-4" style={{ marginLeft: 6 }}>2 at 4x</span>
          <span className="mult mult-3" style={{ marginLeft: 6 }}>2 at 3x</span>
        </span>
        <button className="submit">Submit</button>
      </div>

      <BracketLadder contest={CONTEST} rounds={LADDER} />

      <Rules />

      <div className="card">
        <div className="confhead">Picker</div>
        {[MOCK.barkley!, MOCK.cmc!, MOCK.cook!, MOCK.nacua!].map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            hint="18.4 per game"
            right={<span className="resets">1x</span>}
          />
        ))}
      </div>
    </div>
  );
}
