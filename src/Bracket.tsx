import { useEffect, useState } from 'react';
import { readAllTeams, readContest } from './store/firestore.ts';
import type { Contest, RoundTeams } from './store/firestore.ts';
import { colorOf, crest } from './domain/clubs.ts';
import { tree } from './domain/tree.ts';
import type { Slot } from './domain/tree.ts';
import { explain } from './domain/trouble.ts';

/**
 * The whole bracket, all four rounds, drawn as a bracket.
 *
 * Four columns and the lines between them, which is the shape everybody already knows how to read.
 * The arrangement — which slot sits above which — is worked out in domain/tree.ts, because the
 * rounds are reseeded and a tree drawn in the order the ties happen to be stored would connect
 * clubs that never played each other.
 *
 * No scores on this screen. What is happening right now is the Live tab's job, and it was doing it
 * twice; this one answers the other question, which is who is still in and who they have to get
 * past. A player is only worth holding if his club survives, so this is what you consult before
 * deciding whether a 1x replacement beats a 3x incumbent.
 *
 * Split from the fetching so the design preview can drive it with invented clubs.
 */

const CONTEST = 'rehearsal-2026';

const lockDate = (when: Date) =>
  when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The Monday after a round's games, which is when it gets decided. */
function mondayAfter(lock: Date): Date {
  const monday = new Date(lock);
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
  return monday;
}

const shortDay = (when: Date) =>
  when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function Side({ club, seed, won }: { club: string; seed: number; won: boolean | null }) {
  return (
    <div className={`side ${won === true ? 'won' : ''} ${won === false ? 'out' : ''}`}>
      <span className="seed">{seed}</span>
      <img className="clubcrest" src={crest(club)} alt="" width="22" height="22" loading="lazy" />
      <span className="club" style={won === false ? undefined : { color: colorOf(club) }}>{club}</span>
    </div>
  );
}

/** One box in the tree: a tie, a club resting, or a place nobody has reached yet. */
function Box({ slot, seedOf }: { slot: Slot; seedOf: (club: string) => number }) {
  if (slot.kind === 'empty') {
    return <div className="box empty"><span className="waiting">to be drawn</span></div>;
  }
  if (slot.kind === 'bye') {
    return (
      <div className="box resting">
        <Side club={slot.home} seed={seedOf(slot.home)} won={null} />
        <span className="restinghint">resting — 2x next</span>
      </div>
    );
  }
  return (
    <div className={`box ${slot.winner ? 'settled' : ''}`}>
      <Side club={slot.away} seed={seedOf(slot.away)} won={slot.winner ? slot.winner === slot.away : null} />
      <Side club={slot.home} seed={seedOf(slot.home)} won={slot.winner ? slot.winner === slot.home : null} />
    </div>
  );
}

export function BracketLadder({ contest, rounds }: { contest: Contest; rounds: (RoundTeams | null)[] }) {
  const seedOf = (club: string) => contest.field[club]?.seed ?? 0;
  const columns = tree(
    contest.rounds.map((round) => rounds[round.round] ?? null),
    contest.field,
  );

  return (
    <div className="card">
      {/* Wider than a phone, and a bracket squeezed to 375px is not a bracket. It scrolls. */}
      <div className="treescroll">
        <div className="tree">
          {columns.map((column) => {
            const config = contest.rounds[column.round];
            const lock = contest.locks[String(column.round)];
            const current = column.round === contest.currentRound;
            const decided = column.slots.some((slot) => slot.winner && slot.kind === 'tie');

            return (
              <div className={`treeround ${current ? 'current' : ''}`} key={column.round}>
                <div className="treehead">
                  <span className="treetitle">
                    <strong>{config?.name}</strong>
                    <span className={`state ${current ? 'now' : decided ? 'done' : ''}`}>
                      {decided ? 'decided' : current ? (lock && lock > new Date() ? 'open' : 'in play') : 'to come'}
                    </span>
                  </span>
                  {lock && (
                    <span className="treedate">
                      {decided ? `Decided ${shortDay(mondayAfter(lock))}` : `Locks ${lockDate(lock)}`}
                    </span>
                  )}
                </div>

                <div className="treeslots">
                  {column.slots.map((slot, index) => (
                    <div className="treeslot" key={`${column.round}-${index}`}>
                      <Box slot={slot} seedOf={seedOf} />
                      {/* The vertical that joins this slot to the one below, drawn once per pair. */}
                      {index % 2 === 0 && column.round < columns.length - 1 && <span className="joint" />}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="footnote treefoot">
        Clubs never actually meet. Whichever of the two scores more in its own real fixture goes
        through; tied on points, the quarterback with more passing yards; tied again, the better seed.
        Each round is redrawn best surviving seed against worst, so the lines move as clubs go out.
      </p>
    </div>
  );
}

export function Bracket() {
  const [contest, setContest] = useState<Contest | null>(null);
  const [rounds, setRounds] = useState<(RoundTeams | null)[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const found = await readContest(CONTEST);
        setContest(found);
        if (found) setRounds(await readAllTeams(CONTEST, found.rounds.length));
      } catch (cause) {
        setProblem(explain(cause));
      }
    })();
  }, []);

  if (problem) return <div className="card gate"><p className="problem">{problem}</p></div>;
  if (!contest) return <div className="card gate"><p>Loading the bracket…</p></div>;

  return <BracketLadder contest={contest} rounds={rounds} />;
}
