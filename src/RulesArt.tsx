import type { ReactNode } from 'react';
import type { Breakdown } from './domain/payouts.ts';

/**
 * The drawings on the Rules page, done in code rather than as pictures.
 *
 * Ray asked for graphics to enhance the page and picked four: the prize pool as a bar that moves
 * with the slider, the multiplier as a staircase, the schedule as a timeline, and an icon beside
 * every heading. Drawn here rather than shipped as images so they follow the light and dark themes,
 * stay sharp on any screen, cost nothing to load, and — for the bar — are drawn from the very
 * figures the page states, so the picture cannot disagree with the table under it.
 */

const dollars = (amount: number) => `$${Math.round(amount).toLocaleString()}`;

/* -- Icons ------------------------------------------------------------------------------------- */

/** Simple line icons, drawn on a 24 grid in the current text color. */
const ICONS: Record<string, ReactNode> = {
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></>,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
  climb: <><path d="M3 20h4v-4h4v-4h4V8h4V4" /><path d="M15 4h4v4" /></>,
  out: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  carry: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></>,
  pause: <><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  dollar: <><path d="M12 2v20" /><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  star: <path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z" />,
  podium: <path d="M3 21h18M5 21v-6h4v6M10 21V9h4v12M15 21v-9h4v9" />,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  scale: <><path d="M12 4v16M7 20h10M5 8h14" /><path d="M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z" /></>,
  split: <><path d="M12 21V12M12 12L6 5M12 12l6-7" /><path d="M6 9V5h4M18 9V5h-4" /></>,
  ball: <><ellipse cx="12" cy="12" rx="9.5" ry="6" transform="rotate(-35 12 12)" /><path d="M9 15l6-6M10.5 10.5l1.5 1.5M12 9l1.5 1.5M9 12l1.5 1.5" /></>,
};

/** Which icon each section heading gets, matched on how the heading starts. */
const BY_HEADING: [string, string][] = [
  ['How to Play', 'trophy'], ['Signing Up', 'pen'], ['Your Roster', 'clipboard'],
  ['Keeping Players', 'climb'], ['When an NFL Team Loses', 'out'], ['Doing Nothing', 'carry'],
  ['Players With a Wild Card Bye', 'pause'], ['Lineup Changes', 'lock'], ['Commissioner', 'shield'],
  ['Entry Fees', 'dollar'], ['Best-Week Prizes', 'star'], ['Overall Prizes', 'podium'],
  ['Example', 'sliders'], ['Overall Standings Tiebreakers', 'scale'], ['Best-Week Prize Ties', 'split'],
  ['Fantasy Scoring', 'ball'],
];

export function HeadingIcon({ title }: { title: string }) {
  const name = BY_HEADING.find(([start]) => title.startsWith(start))?.[1];
  if (!name) return null;
  return (
    <span className="ruleicon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name]}
      </svg>
    </span>
  );
}

/* -- The prize pool, as a bar ------------------------------------------------------------------ */

/**
 * Where every dollar of the pot goes, as one bar: the best weeks first, then each overall place.
 *
 * Sized by dollars, from the breakdown the example table prints, so dragging the slider grows the
 * bar's pieces and adds places exactly as the table below does. Small places would be unreadable as
 * labels, so the legend underneath carries the figures and the bar carries the shape.
 */
export function PayoutBar({ paid, rounds }: { paid: Breakdown; rounds: number }) {
  if (paid.pot <= 0) return null;
  const pieces = [
    { key: 'weekly', label: `Best weeks (${rounds} rounds)`, amount: paid.weeklyTotal, className: 'seg-weekly' },
    ...paid.places.map((amount, index) => ({
      key: `place-${index}`,
      label: index === 0 ? '1st' : index === 1 ? '2nd' : index === 2 ? '3rd' : `${index + 1}th`,
      amount,
      className: `seg-place seg-${Math.min(index, 5)}`,
    })),
  ].filter((piece) => piece.amount > 0);

  return (
    <figure className="payoutbar" aria-label={`Prize pool of ${dollars(paid.pot)}`}>
      <div className="payoutbar-track">
        {pieces.map((piece) => (
          <span
            key={piece.key}
            className={`payoutbar-seg ${piece.className}`}
            style={{ flexGrow: piece.amount }}
            title={`${piece.label}: ${dollars(piece.amount)}`}
          >
            {piece.amount / paid.pot >= 0.09 && <span className="payoutbar-tag">{piece.key === 'weekly' ? 'Weekly' : piece.label}</span>}
          </span>
        ))}
      </div>
      <figcaption className="payoutbar-legend">
        {pieces.map((piece) => (
          <span key={piece.key} className="payoutbar-key">
            <i className={`payoutbar-dot ${piece.className}`} />
            {piece.label} <b>{dollars(piece.amount)}</b>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/* -- The multiplier, as a staircase ------------------------------------------------------------ */

/** The tallest step, in pixels. Every other step is in proportion to it. */
const TALLEST = 110;

/** The same 20 points, held 1, 2, 3 and 4 rounds: each step is a round, its height what it counts for. */
export function Staircase({ rounds, points = 20 }: { rounds: number; points?: number }) {
  const steps = Array.from({ length: rounds }, (_, index) => (index + 1) * points);
  const total = steps.reduce((sum, step) => sum + step, 0);
  const tallest = steps[steps.length - 1] ?? 1;
  return (
    <figure className="stairs" aria-label={`Held all ${rounds} rounds, ${points} points a week counts for ${total}`}>
      <div className="stairs-steps">
        {steps.map((step, index) => (
          <div className="stairs-col" key={index}>
            <span className="stairs-value">{step}</span>
            {/* In pixels from a fixed tallest step: a percentage of a column that also holds its labels
                squeezed the top two steps to the same height, which said 60 and 80 were the same. */}
            <span className={`stairs-bar mult-bar-${index + 1}`} style={{ height: `${Math.round((step / tallest) * TALLEST)}px` }}>
              <span className="stairs-mult">{index + 1}×</span>
            </span>
            <span className="stairs-round">Round {index + 1}</span>
          </div>
        ))}
      </div>
      <figcaption className="stairs-total">Held all {rounds} rounds: <b>{total} points</b> from the same {points} a week</figcaption>
    </figure>
  );
}

/* -- The schedule, as a timeline --------------------------------------------------------------- */

export function Timeline({ rounds }: { rounds: { name: string; when: string }[] }) {
  return (
    <ol className="timeline">
      {rounds.map((round, index) => (
        <li className="timeline-stop" key={round.name}>
          <span className="timeline-dot">{index + 1}</span>
          <span className="timeline-name">{round.name}</span>
          <span className="timeline-when">{round.when}</span>
        </li>
      ))}
    </ol>
  );
}
