import { useEffect, useState } from 'react';
import { breakdown, breakdownTotal } from './domain/breakdown.ts';
import type { Position } from './domain/rules.ts';
import { points } from './domain/scoring.ts';
import type { StatLine } from './domain/scoring.ts';
import { statLine } from './domain/statline.ts';
import { sinceWords } from './domain/seen.ts';
import { career } from './domain/career.ts';
import type { CareerTable, RawCategory } from './domain/career.ts';
import { gameLog } from './domain/gamelog.ts';
import type { GameLog } from './domain/gamelog.ts';
import { careerOf, seasonOf } from './providers/career.ts';
import { storiesFor } from './domain/news.ts';
import { useNews } from './providers/news.ts';
import { Face } from './PlayerRow.tsx';
import type { RowPlayer } from './PlayerRow.tsx';

/**
 * How a figure was arrived at, shown because somebody tapped it.
 *
 * A defense projected at 22.51 is either right or badly wrong and no amount of staring at the
 * number will say which. Opened up, "291 return yards ÷ 25 = 11.6" answers it instantly to anybody
 * who has ever watched a punt — which is the point: the people using this know football far better
 * than the app does, and until now they had nothing to check it against.
 *
 * A modal rather than a panel in the page, because the number being asked about is usually halfway
 * down an open picker. Drawn in place it appeared at the top of the screen, out of sight, which
 * looked exactly like nothing happening at all.
 */

export function Breakdown({
  name,
  position,
  line,
  multiplier,
  projected,
  player,
  hint,
  at,
  onClose,
}: {
  name: string;
  position: Position;
  line: StatLine | undefined;
  multiplier: number;
  /** True when this is an expectation rather than something that happened. */
  projected: boolean;
  /** Who he is, when the caller knows. Opened from a name, this is the point of the thing. */
  player?: RowPlayer;
  /** Where he is playing and when, or that his club is resting. */
  hint?: string;
  /** Which tab to open on, since the row has two ways in and they mean different questions. */
  at?: 'career' | 'week' | 'news';
  onClose: () => void;
}) {
  const lines = breakdown(position, line);
  const raw = breakdownTotal(lines);

  /**
   * Three questions, three tabs, and the row decides which one was being asked.
   *
   * Pressing the name means "who is this" and opens on his career. Pressing the marker beside the
   * designation means "what has happened to him" and opens on the news. What he is worth this week
   * is the third, and the app could always answer it — it was buried under a number nobody thought
   * to press.
   */
  const [tab, setTab] = useState<'career' | 'week' | 'news'>(at ?? 'career');
  const stories = storiesFor(useNews(), player?.espnId);
  const [tables, setTables] = useState<CareerTable[] | null>(null);
  const [noCareer, setNoCareer] = useState(false);
  /** The season somebody has opened, and its weeks once they arrive. */
  const [year, setYear] = useState<number | null>(null);
  const [weeks, setWeeks] = useState<GameLog | null>(null);

  // Asked for when the card opens, once per player per page. A career does not change while
  // somebody is deciding on a flex.
  useEffect(() => {
    const espnId = player?.espnId;
    if (!espnId) { setNoCareer(true); return; }

    let wanted = true;
    setTables(null);
    setNoCareer(false);
    void careerOf(espnId)
      .then((categories: RawCategory[]) => { if (wanted) setTables(career(categories, position)); })
      .catch(() => { if (wanted) setNoCareer(true); });
    return () => { wanted = false; };
  }, [player?.espnId, position]);

  /**
   * And the weeks of whichever season was pressed.
   *
   * A season total says a receiver had eleven hundred yards. It does not say whether that was
   * fourteen quiet afternoons and three enormous ones, which is the thing actually being asked.
   */
  useEffect(() => {
    const espnId = player?.espnId;
    if (!espnId || year === null) return;

    let wanted = true;
    setWeeks(null);
    void seasonOf(espnId, year)
      .then((raw) => { if (wanted) setWeeks(gameLog(raw, position)); })
      .catch(() => { if (wanted) setWeeks({ labels: [], games: [] }); });
    return () => { wanted = false; };
  }, [player?.espnId, position, year]);

  // Escape closes it, because a modal that can only be dismissed by aiming at a button is a trap
  // on a phone and an irritation everywhere else.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="backdrop" onClick={onClose} role="presentation">
      <div
        className="card breakdown"
        role="dialog"
        aria-modal="true"
        aria-label={`How ${name} is scored`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confhead">
          {projected ? 'Expected' : 'Scored'}
          <button className="ghost small" onClick={onClose}>Close</button>
        </div>

        {/*
          * Who he is, before what he did.
          *
          * Opened from a number this was a heading with a name in it; opened from the name it has
          * to answer "who is this" first — the face, the club and the fixture — and only then the
          * arithmetic somebody scrolled down for.
          */}
        <div className="cardhead">
          {player && <Face player={player} size={52} />}
          <span className="cardwho">
            <span className="cardname">{name}</span>
            <span className="cardmeta">
              {player ? `${player.position} · ${player.team}` : position}
              {hint && <> · {hint}</>}
            </span>
            {/* The box score in words, which is the most read line on any fantasy screen. */}
            <span className="cardline">{statLine(position, line) || 'Nothing recorded yet.'}</span>
          </span>
        </div>

        <div className="cardtabs">
          <button className={tab === 'career' ? 'on' : ''} onClick={() => setTab('career')}>
            Career
          </button>
          <button className={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>
            {projected ? 'Expected' : 'This round'}
          </button>
          <button className={tab === 'news' ? 'on' : ''} onClick={() => setTab('news')}>
            News{stories.length > 0 && <span className="tabcount small">{stories.length}</span>}
          </button>
        </div>

        {tab === 'career' && (
          <div className="breakdownbody">
            {noCareer ? (
              <div className="pending">
                {player?.position === 'DEF'
                  ? 'A defence has no career page — it is a different eleven every year.'
                  : 'No career record for him.'}
              </div>
            ) : tables === null ? (
              <div className="pending">Looking him up…</div>
            ) : tables.length === 0 ? (
              <div className="pending">Nothing on record yet. A rookie, most likely.</div>
            ) : (
              tables.map((table) => (
                <div className="careertable" key={table.name}>
                  <div className="careerhead">{table.name}</div>
                  <table>
                    <thead>
                      <tr>
                        <th>Year</th>
                        {table.labels.map((label, column) => <th key={`${label}-${column}`}>{label}</th>)}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {table.seasons.map((season) => (
                        <tr
                          key={`${table.name}-${season.year}`}
                          className={`openable ${year === season.year ? 'open' : ''}`}
                          onClick={() => setYear(year === season.year ? null : season.year)}
                        >
                          <td>
                            {season.year}
                            {season.team && <span className="careerclub">{season.team}</span>}
                          </td>
                          {season.figures.map((figure, column) => <td key={column}>{figure}</td>)}
                          <td className="drill">{year === season.year ? '▴' : '▾'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/*
                    * The weeks of whichever season is open, under the table it came from.
                    *
                    * Under rather than in place of: the totals are the thing being explained, and
                    * taking them away to explain them leaves nothing to compare the weeks against.
                    */}
                  {year !== null && (
                    <div className="weeks">
                      <div className="weekshead">{year}, week by week</div>
                      {weeks === null ? (
                        <div className="pending">Looking up the season…</div>
                      ) : weeks.games.length === 0 ? (
                        <div className="pending">No weekly record for that season.</div>
                      ) : (
                        <table>
                          <thead>
                            <tr>
                              <th>Wk</th>
                              <th>Game</th>
                              {weeks.labels.map((label, column) => <th key={`${label}-${column}`}>{label}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {weeks.games.map((game) => (
                              <tr key={game.week}>
                                <td>{game.week}</td>
                                <td>
                                  {game.against}
                                  {game.result && <span className="careerclub">{game.result}</span>}
                                </td>
                                {game.figures.map((figure, column) => <td key={column}>{figure}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'news' && (
          <div className="breakdownbody">
            {stories.length === 0 ? (
              <div className="pending">Nothing written about him in the last day or two.</div>
            ) : (
              stories.map((story) => (
                <a
                  className="story"
                  key={story.headline}
                  href={story.href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <span className="storyhead">{story.headline}</span>
                  {story.summary && story.summary !== story.headline && (
                    <span className="storysaid">{story.summary}</span>
                  )}
                  <span className="storywhen">{sinceWords(story.at)}</span>
                </a>
              ))
            )}
          </div>
        )}

        <div className="breakdownbody" hidden={tab !== 'week'}>
          {lines.length === 0 ? (
            <div className="pending">
              {projected ? 'No projection for him this week.' : 'Nothing recorded yet.'}
            </div>
          ) : (
            <>
              {lines.map((entry) => (
                <div className="ruleline" key={entry.label}>
                  <span>
                    {entry.label}
                    <span className="bdetail">{entry.detail}</span>
                  </span>
                  <span className="rulevalue">{points(entry.points)}</span>
                </div>
              ))}
              <div className="ruleline total">
                <span>{projected ? 'Projected' : 'Scored'}</span>
                <span className="rulevalue">{points(raw)}</span>
              </div>
              {multiplier > 1 && (
                <div className="ruleline total">
                  <span>
                    At your multiplier
                    <span className="bdetail">{points(raw)} × {multiplier}</span>
                  </span>
                  <span className="rulevalue">{points(raw * multiplier)}</span>
                </div>
              )}
            </>
          )}

          <div className="pending">
            {projected
              ? 'A projection, not a promise — the figures the feed expects, run through the league’s own scoring.'
              : 'Every line comes from the same scoring that pays the contest.'}
          </div>
        </div>
      </div>
    </div>
  );
}
