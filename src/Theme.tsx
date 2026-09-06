import { useEffect, useState } from 'react';

/**
 * Light or dark, remembered.
 *
 * Three states rather than two: whatever the phone says, or one the person has chosen. Following
 * the phone is the default because most people have already made this decision once and would
 * rather not make it again.
 *
 * The choice is applied in index.html before anything paints. Setting it here would mean a flash of
 * the wrong theme on every load, which is exactly the thing people notice.
 */

const KEY = 'second-season.theme';
type Choice = 'system' | 'light' | 'dark';

function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // A browser refusing storage is not a reason to refuse the theme.
  }
}

function stored(): Choice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function Theme() {
  const [choice, setChoice] = useState<Choice>('system');

  useEffect(() => setChoice(stored()), []);

  function next() {
    // system → light → dark → system, so somebody can always get back to following the phone.
    const order: Choice[] = ['system', 'light', 'dark'];
    const following = order[(order.indexOf(choice) + 1) % order.length]!;
    setChoice(following);
    apply(following);
  }

  return (
    <button className="theme" onClick={next} title={`Theme: ${choice}`} aria-label={`Theme: ${choice}`}>
      {choice === 'system' ? '◐' : choice === 'light' ? '☀' : '☾'}
    </button>
  );
}
