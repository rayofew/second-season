import { sinceWords } from './domain/seen.ts';
import type { Manager, StandInRegister } from './store/firestore.ts';

/**
 * Who has actually opened the thing.
 *
 * The commissioner's real problem is not the football. It is that he has added nine people, texted
 * them a link, and has no idea which of them ever clicked it — so he cannot tell the difference
 * between somebody who is thinking about his picks and somebody who never got in at all.
 *
 * Firebase knows when each account last signed in, but only a server may read that for anybody
 * other than the person asking, and there is no server here. So each browser stamps its own entry
 * and this reads the stamps back. A manager could lie about them; nobody fakes never having opened
 * an app, which is the only thing this is read for.
 *
 * Stand-ins are separated out rather than listed as nine people ignoring him, since they are
 * played from his own screen and will never sign in to anything.
 */

function Line({ manager, you }: { manager: Manager; you: boolean }) {
  return (
    <div className={`seenrow ${manager.lastSeen ? '' : 'cold'}`}>
      {manager.logo ? <img className="badge small" src={manager.logo} alt="" /> : <span className="badge small empty" />}
      <span className="rowmain">
        <span className="rowname">{manager.teamName}</span>
        <span className="rowmeta">
          {manager.name}
          {you && <><span className="dot">·</span>you</>}
        </span>
      </span>
      <span className="seenwhen">
        <b>{sinceWords(manager.lastSeen)}</b>
        <span className="seenvisits">
          {manager.visits === 0 ? 'no visits' : `${manager.visits} visit${manager.visits === 1 ? '' : 's'}`}
        </span>
      </span>
    </div>
  );
}

export function Log({
  managers,
  standIns,
  uid,
}: {
  managers: Manager[];
  standIns: StandInRegister;
  uid: string;
}) {
  const real = managers.filter((manager) => !standIns[manager.uid]);
  const invented = managers.filter((manager) => standIns[manager.uid]);

  // Most recent first, and whoever has never been in at the bottom where the chasing is done.
  const been = real
    .filter((manager) => manager.lastSeen)
    .sort((first, second) => (second.lastSeen!.getTime() - first.lastSeen!.getTime()));
  const never = real.filter((manager) => !manager.lastSeen);

  return (
    <div className="card">
      <div className="confhead">
        Who has been in
        <span className="colhead">
          {been.length} of {real.length} have opened it
        </span>
      </div>

      {been.map((manager) => <Line key={manager.uid} manager={manager} you={manager.uid === uid} />)}

      {never.length > 0 && (
        <>
          <div className="seenhead">
            Never opened it
            <span className="colhead">{never.length}</span>
          </div>
          {never.map((manager) => <Line key={manager.uid} manager={manager} you={manager.uid === uid} />)}
          <div className="pending">
            Either the link never arrived or it did and they could not get past the sign-in. Worth a
            text before Thursday rather than after it.
          </div>
        </>
      )}

      {invented.length > 0 && (
        <div className="seenfoot">
          {invented.length} stand-in{invented.length === 1 ? '' : 's'} are played from this screen
          and never sign in, so they are left out of the count.
        </div>
      )}
    </div>
  );
}
