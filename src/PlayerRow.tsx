import { useState } from 'react';
import { colorOf, crest, headshot } from './domain/clubs.ts';
import { Breakdown } from './Breakdown.tsx';
import type { Position } from './domain/rules.ts';
import type { StatLine } from './domain/scoring.ts';

/**
 * One player, wherever he appears: on a roster, in the picker, in a scoring breakdown.
 *
 * A face on every row is the difference between a fantasy app and a spreadsheet — you recognize
 * Saquon Barkley before you have read his name. The club's color does the identifying work in the
 * ring around the photo, so the row needs no colored text to say which team he plays for.
 *
 * Team defenses have no face, so they show their crest, which is the honest answer rather than a
 * grey silhouette pretending to be somebody.
 */

export interface RowPlayer {
  id: string;
  name: string;
  position: string;
  team: string;
}

export function Face({ player, size = 44 }: { player: RowPlayer; size?: number }) {
  return (
    <span className="face" style={{ width: size, height: size, borderColor: colorOf(player.team) }}>
      <img
        src={headshot(player.id, player.position)}
        alt=""
        loading="lazy"
        width={size}
        height={size}
        onError={(event) => {
          // No headshot for this man; his club's crest says who he is well enough.
          const image = event.currentTarget;
          if (!image.dataset.fallback) {
            image.dataset.fallback = 'yes';
            image.src = crest(player.team);
            image.classList.add('crest');
          }
        }}
      />
    </span>
  );
}

export function PlayerRow({
  slot,
  player,
  multiplier,
  hint,
  stats,
  trailing,
  right,
  onClick,
  dim,
  card,
}: {
  slot?: string;
  player: RowPlayer | null;
  multiplier?: number;
  hint?: string;
  /** What he did, in box-score words. Its own line, because it is the most read thing here. */
  stats?: string;
  /** Stays on the first line, beside the multiplier. For a figure worth comparing at a glance. */
  trailing?: React.ReactNode;
  /** Drops to its own line on a phone. For controls. */
  right?: React.ReactNode;
  onClick?: () => void;
  dim?: boolean;
  /**
   * What he did, which makes his name worth pressing.
   *
   * Given one, the name becomes a button that opens his card — the box score, every line of the
   * scoring and what the multiplier makes of it. Handled here rather than by each screen, because
   * six screens wiring the same modal is six chances to wire it differently.
   */
  card?: { line: StatLine | undefined; projected: boolean };
}) {
  const [showing, setShowing] = useState(false);

  return (
    <div className={`row ${dim ? 'dim' : ''}`} onClick={onClick}>
      {slot && <span className="rowslot">{slot}</span>}
      {player ? (
        <>
          <Face player={player} />
          <span className="rowmain">
            <span className="rowname">
              {card ? (
                <button
                  className="namebtn"
                  title="His stats"
                  // The row underneath usually does something of its own — picking him, opening a
                  // team — and asking about a man is not asking for either of those.
                  onClick={(event) => { event.stopPropagation(); setShowing(true); }}
                >
                  {player.name}
                </button>
              ) : player.name}
            </span>
            <span className="rowmeta">
              <span className="pos" style={{ color: colorOf(player.team) }}>{player.position}</span>
              <span className="dot">·</span>
              {player.team}
              {hint && <><span className="dot">·</span>{hint}</>}
            </span>
            {stats && <span className="rowstats">{stats}</span>}
          </span>
        </>
      ) : (
        <>
          <span className="face empty" style={{ width: 44, height: 44 }} />
          <span className="rowmain">
            <span className="rowname vacant">Empty</span>
            <span className="rowmeta">{hint ?? 'choose someone'}</span>
          </span>
        </>
      )}
      {trailing}
      {multiplier !== undefined && <span className={`mult mult-${multiplier}`}>{multiplier}x</span>}
      {right}

      {showing && player && card && (
        <Breakdown
          name={player.name}
          position={player.position as Position}
          line={card.line}
          multiplier={multiplier ?? 1}
          projected={card.projected}
          player={player}
          hint={hint}
          onClose={() => setShowing(false)}
        />
      )}
    </div>
  );
}
