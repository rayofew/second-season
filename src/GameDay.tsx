import { byGame, groupCredited } from './domain/gameday.ts';
import type { GameGroup } from './domain/gameday.ts';
import type { Fixture } from './domain/gameday.ts';
import type { LiveTotal } from './domain/live.ts';
import { points } from './domain/scoring.ts';
import { PlayerRow } from './PlayerRow.tsx';
import type { PoolPlayer } from './store/firestore.ts';

/**
 * Sunday, arranged the way it is actually watched.
 *
 * Nine men by slot is the shape for picking a team. It is the wrong shape for following one: nobody
 * wonders how their flex is doing, they see that the Seattle game is on and want to know who they
 * have got in it. So the roster is turned inside out and hung off the fixtures instead.
 *
 * Only games somebody has a man in appear. Fourteen clubs are alive and nine slots are filled from
 * them, so a manager is typically spread across five or six fixtures — and a list of the ten he has
 * nobody in is a list of things he does not care about.
 */

const HEADINGS: Record<GameGroup['state'], string> = {
  playing: 'Playing now',
  upcoming: 'Yet to kick off',
  final: 'Final',
};

const at = (when: Date) =>
  when.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

function Scoreline({ game }: { game: GameGroup }) {
  const mine = groupCredited(game);
  return (
    <div className={`gamehead ${game.state}`}>
      <span className="gameteams">
        {game.state === 'upcoming' ? (
          <>{game.away} at {game.home}</>
        ) : (
          <>
            {game.away} <b>{game.awayPoints}</b>
            <span className="dash">–</span>
            <b>{game.homePoints}</b> {game.home}
          </>
        )}
      </span>
      <span className="gamestate">
        {game.state === 'upcoming' ? at(game.kickoff) : game.clock}
        <span className="gameworth">{points(mine)}</span>
      </span>
    </div>
  );
}

export function GameDay({
  live,
  pool,
  games,
  onGoToTeam,
}: {
  live: LiveTotal;
  pool: Map<string, PoolPlayer>;
  games: Map<string, Fixture>;
  onGoToTeam: () => void;
}) {
  const { games: grouped, resting } = byGame(
    live.players,
    (playerId) => pool.get(playerId)?.team,
    games,
  );

  // A heading only earns its place when the group under it changes, so three states do not become
  // three headings above three lists of one.
  let previous: GameGroup['state'] | null = null;

  return (
    <>
      {grouped.map((game) => {
        const heading = game.state === previous ? null : HEADINGS[game.state];
        previous = game.state;
        return (
          <div key={game.id}>
            {heading && <div className="gamegroup">{heading}</div>}
            <div className="card gamecard">
              <Scoreline game={game} />
              {game.players.map((entry) => {
                const person = pool.get(entry.playerId);
                return (
                  <PlayerRow
                    key={entry.slot}
                    slot={entry.slot}
                    player={person ?? null}
                    multiplier={entry.multiplier}
                    onClick={onGoToTeam}
                    right={
                      <span className={`livepts ${entry.state}`}>
                        <b>{points(entry.credited)}</b>
                        <span className="liveraw">
                          {points(entry.counting)}
                          {entry.state === 'upcoming' ? ' proj' : ''}
                        </span>
                      </span>
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {resting.length > 0 && (
        <>
          <div className="gamegroup">Not playing this round</div>
          <div className="card gamecard">
            {resting.map((entry) => (
              <PlayerRow
                key={entry.slot}
                slot={entry.slot}
                player={pool.get(entry.playerId) ?? null}
                multiplier={entry.multiplier}
                hint="resting — the round still counts towards holding him"
                onClick={onGoToTeam}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
