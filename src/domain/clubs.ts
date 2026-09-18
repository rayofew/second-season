/**
 * Club colors and crests.
 *
 * The colors are typed out because nobody publishes them as an API worth depending on, and there
 * are only thirty-two. Each is the club's primary, chosen to sit on a dark ground — a few real
 * primaries are almost black, so those use the secondary instead and the badge stays legible.
 *
 * Crests and headshots come from Sleeper's CDN, which serves both free and keys them by the same
 * player id we already hold. Images need no CORS headers unless a canvas reads their pixels, and
 * nothing here does.
 */

export const CLUB_COLOR: Record<string, string> = {
  ARI: '#97233f', ATL: '#a71930', BAL: '#7c5cbf', BUF: '#00338d', CAR: '#0085ca',
  CHI: '#e64100', CIN: '#fb4f14', CLE: '#ff3c00', DAL: '#7f9695', DEN: '#fb4f14',
  DET: '#0076b6', GB:  '#ffb612', HOU: '#a71930', IND: '#0058a8', JAX: '#12a2a8',
  KC:  '#e31837', LAC: '#0080c6', LAR: '#ffd100', LV:  '#a5acaf', MIA: '#008e97',
  MIN: '#8e4ac2', NE:  '#c60c30', NO:  '#d3bc8d', NYG: '#0b64c8', NYJ: '#28a05c',
  PHI: '#12a594', PIT: '#ffb612', SEA: '#69be28', SF:  '#c9243f', TB:  '#d50a0a',
  TEN: '#4b92db', WAS: '#ffb612',
};

export const colorOf = (club: string | null | undefined): string =>
  (club && CLUB_COLOR[club.toUpperCase()]) || '#5d6a86';

/** A player's face. Team defenses have no headshot, so they show their crest instead. */
export const headshot = (playerId: string, position: string): string =>
  position === 'DEF'
    ? `https://sleepercdn.com/images/team_logos/nfl/${playerId.toLowerCase()}.png`
    : `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`;

export const crest = (club: string): string =>
  `https://sleepercdn.com/images/team_logos/nfl/${club.toLowerCase()}.png`;

/**
 * What people actually call each club.
 *
 * Abbreviations are right where space is tight and wrong where it is not: 'Chargers' is what
 * anybody watching says, and 'LAC' is what a table says when it cannot fit the word.
 */
export const CLUB_NAME: Record<string, string> = {
  ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills',
  CAR: 'Panthers', CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns',
  DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers',
  HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars', KC: 'Chiefs',
  LAC: 'Chargers', LAR: 'Rams', LV: 'Raiders', MIA: 'Dolphins',
  MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants',
  NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks',
  SF: '49ers', TB: 'Buccaneers', TEN: 'Titans', WSH: 'Commanders',
};

/** The club's name, falling back to its abbreviation for anything the list does not know. */
export const nameOf = (club: string): string => CLUB_NAME[club] ?? club;
