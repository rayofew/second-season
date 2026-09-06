import { useEffect, useState } from 'react';

/**
 * How long until picks lock.
 *
 * "In 11 days" is true and useless: it says the same thing for a day and a half and then jumps. A
 * deadline people are meant to act on should show the parts that are actually moving.
 *
 * So it counts down in three units, and which three depends on how close it is. A fortnight out
 * nobody cares about seconds; twenty minutes out, seconds are the only thing anybody is looking at.
 * The tick follows the same logic, because a page that re-renders every second for a week is a
 * page draining somebody's battery to tell them nothing.
 */

interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function remaining(until: Date, now: Date): Parts {
  const total = Math.max(0, Math.floor((until.getTime() - now.getTime()) / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (value: number) => String(value).padStart(2, '0');

export function Countdown({ until, locked }: { until: Date | undefined; locked: boolean }) {
  const [now, setNow] = useState(() => new Date());

  const left = until ? remaining(until, now) : null;
  const closeIn = left !== null && left.days === 0;

  useEffect(() => {
    if (locked || !until) return;
    // Every second once it is down to hours; otherwise a minute is plenty and costs nothing.
    const every = closeIn ? 1000 : 30_000;
    const timer = setInterval(() => setNow(new Date()), every);
    return () => clearInterval(timer);
  }, [locked, until, closeIn]);

  if (locked || !until || !left) {
    return <div className="clock shut">Locked</div>;
  }

  // A fortnight out nobody is counting seconds; twenty minutes out they are counting nothing else.
  const cells = left.days > 0
    ? [
        { value: left.days, label: left.days === 1 ? 'day' : 'days' },
        { value: left.hours, label: 'hrs' },
        { value: left.minutes, label: 'min' },
      ]
    : [
        { value: left.hours, label: 'hrs' },
        { value: left.minutes, label: 'min' },
        { value: left.seconds, label: 'sec' },
      ];

  const urgent = left.days === 0 && left.hours < 6;

  return (
    <div className={`clock ${urgent ? 'soon' : ''}`}>
      {cells.map((cell, index) => (
        <span className="cell" key={cell.label}>
          <span className="digits">{index === 0 ? cell.value : pad(cell.value)}</span>
          <span className="unit">{cell.label}</span>
        </span>
      ))}
    </div>
  );
}
