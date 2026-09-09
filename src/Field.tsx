import type { Manager } from './store/firestore.ts';

/**
 * Who else is playing.
 *
 * People join these things because they can see their brother-in-law already has. Until now a
 * manager signed in and saw a number in the header and nothing else — no names, no badges, no
 * sense that anybody was coming — which is the worst possible impression for a league that is
 * still filling up.
 *
 * Names and team names only. Rosters stay sealed until the lock, because seeing what somebody
 * picked while there is still time to copy it is the one thing the whole schedule protects
 * against. Knowing who is in the room gives nothing away.
 */

export function Field({ managers, you }: { managers: Manager[]; you: string }) {
  if (managers.length === 0) return null;

  // Yourself first, then everybody else as they joined, so the list reads as "me and these people".
  const ordered = [
    ...managers.filter((manager) => manager.uid === you),
    ...managers.filter((manager) => manager.uid !== you),
  ];

  return (
    <div className="card">
      <div className="confhead">
        In the league
        <span className="colhead">{managers.length} {managers.length === 1 ? 'manager' : 'managers'}</span>
      </div>
      <div className="fieldgrid">
        {ordered.map((manager) => (
          <span className={`fieldone ${manager.uid === you ? 'me' : ''}`} key={manager.uid}>
            {manager.logo
              ? <img className="badge small" src={manager.logo} alt="" />
              : <span className="badge small empty" />}
            <span className="fieldnames">
              <span className="fieldteam">{manager.teamName}</span>
              <span className="fieldwho">{manager.uid === you ? 'you' : manager.name}</span>
            </span>
          </span>
        ))}
      </div>
      {managers.length < 4 && (
        <div className="pending">
          Still filling up. Anybody you send the link to lands on the same screen you did.
        </div>
      )}
    </div>
  );
}
