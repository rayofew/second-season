/**
 * Which screen the address bar is pointing at.
 *
 * The app is one page and the tabs were React state, which meant the browser had no idea anybody
 * had gone anywhere. Open it from a text message, tap through to the bracket, press back — and
 * back is still the text message, because as far as the browser is concerned nothing has happened
 * since it opened. On a phone that is the most used button there is.
 *
 * So each tab gets a hash and a history entry. Back walks the tabs; back from the first one leaves,
 * which is right, because that is where somebody came in.
 */

export const TABS = [
  'home', 'team', 'live', 'bracket', 'standings', 'board', 'moves', 'rules', 'commish',
] as const;

export type Tab = (typeof TABS)[number];

const is = (value: string): value is Tab => (TABS as readonly string[]).includes(value);

/**
 * Anything unrecognised is home.
 *
 * A link somebody has retyped, a hash left over from an older version, or the bare address — all
 * of them should open the app rather than an error, and home is where the app opens.
 */
export function tabFromHash(hash: string): Tab {
  const said = hash.replace(/^#\/?/, '').toLowerCase();
  return is(said) ? said : 'home';
}

export const hashFor = (tab: Tab): string => `#${tab}`;
