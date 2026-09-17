import { liveTie, whyLeading } from './domain/bracketlive.ts';
import type { Fixture, Side } from './domain/bracketlive.ts';
import type { Field, Matchup } from './domain/advance.ts';
import { colorOf, crest } from './domain/clubs.ts';

/**
 * The round as it currently stands, while it is being played.
 *
 * The bracket says who is drawn against whom. This says who is winning, which here is a stranger
 * question than usual: the two clubs never meet, so it is settled by two separate afternoons that
 * have nothing to do with each other.
 *
 * Laid out as the tie rather than as two fixtures — one club on the left, its bracket opponent
 * mirrored on the right, what it means between them. Stacked, it read as a list of games, which is
 * what the football below this already is. Here the pairing is the point, and a pairing has two
 * sides.
 *
 * In January the two clubs do meet and the same row still holds: each side's own fixture line would
 * only name the other, so it goes and the clock moves to the middle where a shared clock belongs.
 * Worked out from the schedule rather than a setting, so nothing has to be changed in December.
 */

const kickoffAt = (side: Side) =>
  side.kickoff?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) ?? '';

const clockFor = (side: Side) =>
  side.state === 'upcoming' ? kickoffAt(side) : side.state === 'final' ? 'Final' : side.clock;

/**
 * One half of a tie, as a panel.
 *
 * The crest sits in a frame of its own rather than floating beside the text, which is what stops
 * fourteen different logos at fourteen different aspect ratios from making every row look
 * slightly broken.
 */
function TieSide({
  side,
  mirrored,
  sharing,
  leading,
}: {
  side: Side;
  mirrored?: boolean;
  sharing: boolean;
  leading: boolean;
}) {
  return (
    <div className={`tieside ${side.state} ${mirrored ? 'mirrored' : ''} ${leading ? 'leading' : ''}`}>
      <div className="tietop">
        <span className="tiecrest" style={{ borderColor: colorOf(side.club) }}>
          <img src={crest(side.club)} alt="" width="30" height="30" loading="lazy" />
        </span>
        <span className="tieclub" style={{ color: colorOf(side.club) }}>{side.club}</span>
        <span className="tienums">
          <span className="tiescore">{side.state === 'upcoming' ? '–' : side.points}</span>
          {side.projected !== undefined && side.state !== 'final' && (
            <span className="tieproj">{Math.round(side.projected * 10) / 10} proj</span>
          )}
        </span>
      </div>
      {/* Where they play each other, this line would name the opponent twice over. */}
      {!sharing && (
        <div className="tieown">
          <span>{side.against ? `${side.home ? 'v' : 'at'} ${side.against}` : 'no fixture'}</span>
          <span className={`tiewhen ${side.state}`}>{clockFor(side)}</span>
        </div>
      )}
    </div>
  );
}

export function LiveBracket({
  matchups,
  fixtures,
  field,
  passingYardsFor,
  roundName,
}: {
  matchups: Matchup[];
  fixtures: Map<string, Fixture>;
  field: Field;
  passingYardsFor: (club: string) => number;
  roundName: string;
}) {
  if (matchups.length === 0) return null;

  const ties = matchups.map((matchup) => liveTie(matchup, fixtures, field, passingYardsFor));
  const settled = ties.filter((tie) => tie.settled).length;

  return (
    <div className="card">
      <div className="confhead">
        {roundName} — as it stands
        <span className="colhead">{settled} of {ties.length} decided</span>
      </div>

      {ties.map((tie) => {
        const why = whyLeading(tie, field, passingYardsFor);
        const [away, home] = tie.sides;
        return (
          <div className={`livetie ${tie.settled ? 'done' : ''}`} key={`${tie.away}@${tie.home}`}>
            <div className="tierow">
              <TieSide side={away} sharing={tie.headToHead} leading={tie.leading === away.club} />
              <span className="tiemiddle">
                <span className="tievs">v</span>
                {tie.headToHead && <span className={`tiewhen ${home.state}`}>{clockFor(home)}</span>}
              </span>
              <TieSide side={home} mirrored sharing={tie.headToHead} leading={tie.leading === home.club} />
            </div>

            <div className={`tiestate ${tie.settled ? 'done' : tie.leading ? 'leading' : 'waiting'}`}>
              {tie.state}
              {why && <span className="tiewhy">{why}</span>}
            </div>
          </div>
        );
      })}

      <div className="pending">
        Provisional until every club has finished, and worked out by the same code that decides the
        round on Monday night — tiebreakers included.
      </div>
    </div>
  );
}
