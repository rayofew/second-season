import { createContext, useContext } from 'react';

/**
 * Which game the screen is showing.
 *
 * Ray: "i should be able to run as many games as i want". Every game is its own contest — its own
 * bracket, rosters, standings and money — and everything on screen belongs to exactly one of them.
 * The id used to be written into every file as 'rehearsal-2026'; now each screen asks for it here,
 * and the app sets it from whichever game somebody has picked.
 *
 * The whole page is keyed on it, so switching games remounts every screen rather than leaving one
 * game's data on screen under another's name.
 */
export const REHEARSAL = 'rehearsal-2026';

const GameContext = createContext<string>(REHEARSAL);

export const GameProvider = GameContext.Provider;

/** The id of the game this screen belongs to. */
export const useGame = (): string => useContext(GameContext);

/**
 * Whoever set the site up, who alone may add, rename and switch games on and off. The same uid the
 * security rules name as OWNER(); the rules are what actually enforce it.
 */
export const OWNER_UID = 'YmGUiqlUSudC5CEW5UYcsLYhnuE3';

const PICKED = 'game';

/** The game this device last looked at, so a reload does not drop somebody back on another one. */
export function rememberedGame(): string {
  try { return localStorage.getItem(PICKED) ?? REHEARSAL; } catch { return REHEARSAL; }
}

export function rememberGame(id: string): void {
  try { localStorage.setItem(PICKED, id); } catch { /* a private window keeps nothing, which is fine */ }
}
