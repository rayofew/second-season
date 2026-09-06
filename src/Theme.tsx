import { useEffect, useState } from 'react';

/**
 * Light or dark, remembered.
 *
 * Three states rather than two: follow the phone, or choose. Following is the default, because most
 * people made this decision once already and would rather not make it again.
 *
 * The choice is applied in index.html before anything paints. Doing it here would flash the wrong
 * theme on every load, which is exactly the thing people notice.
 *
 * Two ways to set it — a compact control in the header and a full one on the join form — kept in
 * step by an event, so changing it in one place does not leave the other lying.
 */

const KEY = 'second-season.theme';
const CHANGED = 'second-season.theme.changed';

export type Choice = 'system' | 'light' | 'dark';

export const CHOICES: { value: Choice; label: string; icon: string }[] = [
  { value: 'system', label: 'Auto', icon: '◐' },
  { value: 'light', label: 'Light', icon: '☀' },
  { value: 'dark', label: 'Dark', icon: '☾' },
];

function read(): Choice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function write(choice: Choice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // A browser refusing storage is not a reason to refuse the theme.
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function useTheme(): [Choice, (choice: Choice) => void] {
  const [choice, setChoice] = useState<Choice>('system');

  useEffect(() => {
    setChoice(read());
    const sync = () => setChoice(read());
    window.addEventListener(CHANGED, sync);
    return () => window.removeEventListener(CHANGED, sync);
  }, []);

  return [choice, write];
}

/** The compact one, for the header: shows what it is rather than only offering to change it. */
export function Theme() {
  const [choice, set] = useTheme();
  const current = CHOICES.find((entry) => entry.value === choice)!;

  function next() {
    const order = CHOICES.map((entry) => entry.value);
    set(order[(order.indexOf(choice) + 1) % order.length]!);
  }

  return (
    <button className="theme" onClick={next} aria-label={`Theme: ${current.label}. Tap to change.`}>
      <span className="themeicon">{current.icon}</span>
      <span className="themelabel">{current.label}</span>
    </button>
  );
}

/** The full one, for the join form, where somebody is setting things up for the first time. */
export function ThemeChoice() {
  const [choice, set] = useTheme();

  return (
    <div className="themepick">
      <span className="reasonlabel">Appearance</span>
      <div className="themerow">
        {CHOICES.map((entry) => (
          <button
            key={entry.value}
            className={`themeopt ${choice === entry.value ? 'on' : ''}`}
            onClick={() => set(entry.value)}
            aria-pressed={choice === entry.value}
          >
            <span className="themeicon">{entry.icon}</span>
            {entry.label}
          </button>
        ))}
      </div>
      <p className="themenote">
        Auto follows your phone. You can change this any time from the top of the screen.
      </p>
    </div>
  );
}
