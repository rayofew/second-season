import { useState } from 'react';
import { liveTie, whyLeading } from './domain/bracketlive.ts';
import type { Fixture, Side } from './domain/bracketlive.ts';
import type { Field, Matchup } from './domain/advance.ts';
import { colorOf, crest } from './domain/clubs.ts';
import { points } from './domain/scoring.ts';
import { Face } from './PlayerRow.tsx';

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

/**
 * When this club plays, which is not when the other one does.
 *
 * The two halves of a tie kick off at different times far more often than not — that is the
 * whole shape of the rehearsal — so the time belongs under each club rather than once under the
 * pair, where it could only ever be right about one of them.
 */
const kickoffAt = (side: Side) =>
  side.kickoff
    ? side.kickoff.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : '';

const clockFor = (side: Side) =>
  side.state === 'upcoming' ? kickoffAt(side) : side.state === 'final' ? 'Final' : side.clock;

const rounded = (value: number) => Math.round(value * 10) / 10;

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
        {/*
          * The box holds whichever number is the live one.
          *
          * Before kickoff that is the expectation, because there is nothing else; after it, the
          * scoreboard, with the expectation demoted underneath where it can be compared against
          * what actually happened.
          */}
        <span className="tienums">
          <span className={`tiescore ${side.state}`}>
            {side.state === 'upcoming'
              ? (side.projected === undefined ? '–' : rounded(side.projected))
              : side.points}
          </span>
          {side.state !== 'upcoming' && side.projected !== undefined && (
            <span className="tieproj">{rounded(side.projected)} proj</span>
          )}
          {side.state === 'upcoming' && side.projected !== undefined && (
            <span className="tieproj">projected</span>
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

/** A man somebody has picked, and everybody who picked him. */
export interface Held {
  id: string;
  name: string;
  position: string;
  team: string;
  /** What he has scored, or his projection if his game has not started. */
  counting: number;
  projected: number;
  started: boolean;
  /** The managers holding him, each with the multiplier he is worth to that one. Empty is normal. */
  by: { name: string; multiplier: number; you: boolean }[];
}

/**
 * Every man from one club, and whoever has picked him.
 *
 * All of them rather than only the picked ones, because the question asked in front of a game
 * is as often "who else is in this" as "who have I got". The ones nobody took simply carry no
 * chips.
 *
 * The pool is shared, so a club having an afternoon does not help one manager — it helps however
 * many picked from it, by different amounts. A receiver held by six people at 1x and by one at
 * 4x is the whole texture of this format, and it exists nowhere else in the app.
 */
function Squad({ club, held }: { club: string; held: Held[] }) {
  if (held.length === 0) {
    return (
      <div className="tiesquad">
        <div className="squadhead">{club}</div>
        <div className="pending">Nobody from this club is in the pool.</div>
      </div>
    );
  }
  return (
    <div className="tiesquad">
      <div className="squadhead">
        {club}
        <span className="colhead">{held.filter((man) => man.by.length > 0).length} of {held.length} picked</span>
      </div>
      {held.map((man) => (
        <div className={`heldline ${man.by.length > 0 ? 'taken' : ''}`} key={man.id}>
          <Face player={man} size={30} />
          <span className="heldmain">
            <span className="heldname">
              {man.name}
              <span className="pos">{man.position}</span>
            </span>
            <span className="heldby">
              {man.by.map((owner, index) => (
                <span className={`owner ${owner.you ? 'you' : ''}`} key={`${owner.name}-${index}`}>
                  {owner.name}
                  <span className={`mult mult-${owner.multiplier}`}>{owner.multiplier}x</span>
                </span>
              ))}
            </span>
          </span>
          <span className={`livepts ${man.started ? 'final' : 'upcoming'}`}>
            <b>{points(man.counting)}</b>
            <span className="liveraw">{man.started ? `${points(man.projected)} proj` : 'proj'}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function LiveBracket({
  matchups,
  fixtures,
  field,
  passingYardsFor,
  roundName,
  heldBy,
}: {
  matchups: Matchup[];
  fixtures: Map<string, Fixture>;
  field: Field;
  passingYardsFor: (club: string) => number;
  roundName: string;
  /** Who everybody has picked, by club. Absent before the lock, when nobody may know. */
  heldBy?: Map<string, Held[]>;
}) {
  const [open, setOpen] = useState<string | null>(null);
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
              <span>
                {tie.state}
                {why && <span className="tiewhy">{why}</span>}
              </span>
              {heldBy && (
                <button
                  className="tieopen"
                  aria-expanded={open === tie.home}
                  onClick={() => setOpen(open === tie.home ? null : tie.home)}
                >
                  {open === tie.home ? 'Hide who has picked' : 'Who has picked'}
                  <span className="chev">{open === tie.home ? '▴' : '▾'}</span>
                </button>
              )}
            </div>

            {heldBy && open === tie.home && (
              <div className="tiesquads">
                <Squad club={away.club} held={heldBy.get(away.club) ?? []} />
                <Squad club={home.club} held={heldBy.get(home.club) ?? []} />
              </div>
            )}
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
