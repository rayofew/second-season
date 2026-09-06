import { useEffect, useState } from 'react';

/**
 * How long until picks lock.
 *
 * "In 11 days" is true and useless: it says the same thing for a day and a half and then jumps. A
 * deadline people are meant to act on should show the parts that are actually moving.
 *
 * Four units, seconds included, because a clock whose smallest hand never moves does not read as a
 * clock — and the second that is ticking is what tells somebody the page is live rather than a
 * screenshot of a deadline.
 *
 * Days drop away once there are none left, so the last day counts hours, minutes and seconds across
 * three larger cells rather than leading with a nought nobody needs.
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

  useEffect(() => {
    if (locked || !until) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [locked, until]);

  if (locked || !until || !left) {
    return <div className="clock shut">Locked</div>;
  }

  // Days only while there are any: on the last day, three larger cells beat a leading nought.
  const cells = [
    ...(left.days > 0 ? [{ value: left.days, label: left.days === 1 ? 'day' : 'days' }] : []),
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
