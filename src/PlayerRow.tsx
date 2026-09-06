import { colorOf, crest, headshot } from './domain/clubs.ts';

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
  trailing,
  right,
  onClick,
  dim,
}: {
  slot?: string;
  player: RowPlayer | null;
  multiplier?: number;
  hint?: string;
  /** Stays on the first line, beside the multiplier. For a figure worth comparing at a glance. */
  trailing?: React.ReactNode;
  /** Drops to its own line on a phone. For controls. */
  right?: React.ReactNode;
  onClick?: () => void;
  dim?: boolean;
}) {
  return (
    <div className={`row ${dim ? 'dim' : ''}`} onClick={onClick}>
      {slot && <span className="rowslot">{slot}</span>}
      {player ? (
        <>
          <Face player={player} />
          <span className="rowmain">
            <span className="rowname">{player.name}</span>
            <span className="rowmeta">
              <span className="pos" style={{ color: colorOf(player.team) }}>{player.position}</span>
              <span className="dot">·</span>
              {player.team}
              {hint && <><span className="dot">·</span>{hint}</>}
            </span>
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
    </div>
  );
}
