import { useState } from 'react';
import { clubPoints, noPoints } from './domain/clubpoints.ts';
import type { ClubPoints, Named, PlayerPoints } from './domain/clubpoints.ts';
import { colorOf, crest } from './domain/clubs.ts';
import { points } from './domain/scoring.ts';
import type { StatLine } from './domain/scoring.ts';
import { statLine } from './domain/statline.ts';
import type { Position } from './domain/rules.ts';
import type { ClubGame } from './providers/schedule.ts';
import { Face } from './PlayerRow.tsx';

/**
 * Every game this week, and what each club in it is worth.
 *
 * Laid out as a fixture is read: one club on the left, the other mirrored on the right, the score
 * between them. Open one and both squads are underneath, each man with what he has scored and what
 * he was expected to — which is the answer to "who is doing well that I have not got", asked in
 * front of the game it is being asked about rather than in a list of a hundred and forty names.
 *
 * A club's defense is one row, because that is what the league picks and what gets scored. Nobody
 * can own a linebacker here, so listing him would be listing something that cannot be acted on.
 */

interface Fixture {
  id: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  state: ClubGame['state'];
  clock: string;
  kickoff: Date;
}

const slot = (when: Date) =>
  when.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' });

export function Games({
  alive,
  byes,
  games,
  pool,
  actual,
  expected,
  roundName,
}: {
  alive: string[];
  byes: string[];
  games: Map<string, ClubGame>;
  pool: Named[];
  actual: Record<string, StatLine>;
  expected: Record<string, StatLine>;
  roundName: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const resting = new Set(byes);
  const totals = clubPoints(pool, actual, expected, (club) => games.get(club)?.state ?? 'upcoming');

  // One entry per fixture, however many of its two clubs are still in the bracket.
  const fixtures = new Map<string, Fixture>();
  for (const club of alive) {
    if (resting.has(club)) continue;
    const game = games.get(club);
    if (!game?.against) continue;
    const home = game.home ? club : game.against;
    const away = game.home ? game.against : club;
    const id = `${away}@${home}`;
    if (fixtures.has(id)) continue;
    const other = games.get(game.against);
    fixtures.set(id, {
      id,
      home,
      away,
      homeScore: game.home ? game.points : (other?.points ?? 0),
      awayScore: game.home ? (other?.points ?? 0) : game.points,
      state: game.state,
      clock: game.clock,
      kickoff: game.kickoff,
    });
  }

  const ordered = [...fixtures.values()].sort(
    (first, second) => first.kickoff.getTime() - second.kickoff.getTime()
      || first.id.localeCompare(second.id),
  );

  if (ordered.length === 0 && resting.size === 0) return null;
  let previous = '';

  return (
    <div className="card">
      <div className="confhead">
        {roundName} — the football
        <span className="colhead">{ordered.length} {ordered.length === 1 ? 'game' : 'games'}</span>
      </div>

      {ordered.map((fixture) => {
        const when = slot(fixture.kickoff);
        const heading = when === previous ? null : when;
        previous = when;
        const showing = open === fixture.id;
        const away = totals.get(fixture.away) ?? noPoints(fixture.away, fixture.state);
        const home = totals.get(fixture.home) ?? noPoints(fixture.home, fixture.state);
        const started = fixture.state !== 'upcoming';

        return (
          <div key={fixture.id}>
            {heading && <div className="whenhead">{heading}</div>}
            <button
              className={`gamerow ${fixture.state} ${showing ? 'opened' : ''}`}
              onClick={() => setOpen(showing ? null : fixture.id)}
              aria-expanded={showing}
            >
              <ClubSide club={away} inBracket={alive.includes(fixture.away)} />
              <span className="gamemiddle">
                <span className="gamescore">
                  {started ? `${fixture.awayScore} – ${fixture.homeScore}` : 'vs'}
                </span>
                <span className={`gamewhen ${fixture.state}`}>
                  {fixture.state === 'playing' ? fixture.clock
                    : fixture.state === 'final' ? 'Final'
                    : fixture.kickoff.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </span>
              </span>
              <ClubSide club={home} inBracket={alive.includes(fixture.home)} mirrored />
            </button>

            {showing && (
              <div className="squads">
                <Squad club={away} />
                <Squad club={home} />
              </div>
            )}
          </div>
        );
      })}

      {resting.size > 0 && (
        <>
          <div className="whenhead">Resting</div>
          <div className="gamerow resting">
            <span className="restingclubs">
              {[...resting].map((club) => (
                <span className="restingclub" key={club}>
                  <img className="clubcrest" src={crest(club)} alt="" width="20" height="20" loading="lazy" />
                  <span style={{ color: colorOf(club) }}>{club}</span>
                </span>
              ))}
            </span>
            <span className="gamewhen">scores nothing, but the round still counts towards holding</span>
          </div>
        </>
      )}
    </div>
  );
}

/** One club: crest, name, what it has produced and what it was expected to. */
function ClubSide({ club, inBracket, mirrored }: { club: ClubPoints; inBracket: boolean; mirrored?: boolean }) {
  return (
    <span className={`gameclub ${mirrored ? 'mirrored' : ''} ${inBracket ? '' : 'outside'}`}>
      <img className="clubcrest big" src={crest(club.club)} alt="" width="30" height="30" loading="lazy" />
      <span className="gameclubnames">
        <span className="gameclubname" style={inBracket ? { color: colorOf(club.club) } : undefined}>
          {club.club}
        </span>
        {club.players.length > 0 && (
          <span className="gameclubpts">
            <b>{club.state === 'upcoming' ? '–' : points(club.points)}</b>
            <span className="gameproj">{points(club.projected)} proj</span>
          </span>
        )}
      </span>
    </span>
  );
}

function Squad({ club }: { club: ClubPoints }) {
  if (club.players.length === 0) {
    return (
      <div className="squad">
        <div className="squadhead">{club.club}</div>
        <div className="pending">Nobody from this club is in the pool.</div>
      </div>
    );
  }
  return (
    <div className="squad">
      <div className="squadhead">
        {club.club}
        <span className="colhead">{points(club.points)} · {points(club.projected)} proj</span>
      </div>
      {club.players.map((player) => <Line key={player.id} player={player} />)}
    </div>
  );
}

function Line({ player }: { player: PlayerPoints }) {
  const said = statLine(player.position as Position, player.line);
  return (
    <div className="squadline">
      <Face player={player} size={32} />
      <span className="squadmain">
        <span className="squadname">
          {player.name}
          <span className="pos">{player.position}</span>
        </span>
        {said && <span className="rowstats">{said}</span>}
      </span>
      <span className="heldnums">
        <span className={`heldnum ${player.state !== 'upcoming' ? 'live' : ''}`}>
          <b>{player.state === 'upcoming' ? '–' : points(player.points)}</b>
          <span className="numlabel">pts</span>
        </span>
        <span className="heldnum">
          <b>{points(player.projected)}</b>
          <span className="numlabel">proj</span>
        </span>
      </span>
    </div>
  );
}
