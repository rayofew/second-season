import { useEffect } from 'react';
import { breakdown, breakdownTotal } from './domain/breakdown.ts';
import type { Position } from './domain/rules.ts';
import { points } from './domain/scoring.ts';
import type { StatLine } from './domain/scoring.ts';

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
  onClose,
}: {
  name: string;
  position: Position;
  line: StatLine | undefined;
  multiplier: number;
  /** True when this is an expectation rather than something that happened. */
  projected: boolean;
  onClose: () => void;
}) {
  const lines = breakdown(position, line);
  const raw = breakdownTotal(lines);

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
          {name}
          <button className="ghost small" onClick={onClose}>Close</button>
        </div>

        <div className="breakdownbody">
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
