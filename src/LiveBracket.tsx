import { liveTie, whyLeading } from './domain/bracketlive.ts';
import type { Fixture, LiveTie } from './domain/bracketlive.ts';
import type { Field, Matchup } from './domain/advance.ts';
import { colorOf, crest } from './domain/clubs.ts';

/**
 * The round as it currently stands, while it is being played.
 *
 * The bracket itself says who is drawn against whom. This says who is winning, which for this
 * contest is a different and stranger question: the two clubs never meet, so it is decided by two
 * separate afternoons that have nothing to do with each other. Both have to be on screen or the
 * answer looks arbitrary.
 *
 * In January the two clubs do meet, and the same rows collapse to one scoreline — worked out from
 * the schedule rather than a setting, so nothing has to be remembered and changed in December.
 */

function SideLine({ side }: { side: LiveTie['sides'][number] }) {
  const done = side.state === 'final';
  return (
    <div className={`tieside ${side.state}`}>
      <img className="clubcrest" src={crest(side.club)} alt="" width="22" height="22" loading="lazy" />
      <span className="tieclub" style={{ color: colorOf(side.club) }}>{side.club}</span>
      <span className="tiescore">{side.state === 'upcoming' ? '–' : side.points}</span>
      <span className="tieagainst">
        {side.against ? `${side.home ? 'v' : 'at'} ${side.against}` : 'no fixture'}
      </span>
      <span className={`tieclock ${side.state}`}>
        {side.state === 'upcoming'
          ? (side.kickoff?.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) ?? '')
          : done ? 'Final' : side.clock}
      </span>
    </div>
  );
}

/**
 * The January shape: these two are each other's fixture, so it is one line with both scores.
 *
 * Drawing one side of it would lose the other's score entirely, which is half the game.
 */
function Meeting({ tie }: { tie: LiveTie }) {
  const [away, home] = tie.sides;
  const live = home.state === 'playing';
  return (
    <div className={`meeting ${home.state}`}>
      <span className="meetside">
        <img className="clubcrest" src={crest(away.club)} alt="" width="22" height="22" loading="lazy" />
        <span className="tieclub" style={{ color: colorOf(away.club) }}>{away.club}</span>
      </span>
      <span className="meetscore">
        {home.state === 'upcoming' ? '–' : `${away.points} – ${home.points}`}
      </span>
      <span className="meetside right">
        <span className="tieclub" style={{ color: colorOf(home.club) }}>{home.club}</span>
        <img className="clubcrest" src={crest(home.club)} alt="" width="22" height="22" loading="lazy" />
      </span>
      <span className={`tieclock ${home.state}`}>
        {home.state === 'upcoming'
          ? (home.kickoff?.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) ?? '')
          : live ? home.clock : 'Final'}
      </span>
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
        return (
          <div className={`livetie ${tie.settled ? 'done' : ''}`} key={`${tie.away}@${tie.home}`}>
            <div className="tiehead">
              {tie.away} <span className="tievs">v</span> {tie.home}
              {tie.headToHead && <span className="tag">head to head</span>}
            </div>

            {/* Where they actually meet it is one game, so it is one scoreline with both on it. */}
            {tie.headToHead ? <Meeting tie={tie} /> : tie.sides.map((side) => (
              <SideLine key={side.club} side={side} />
            ))}

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
