import { useCallback, useEffect, useState } from 'react';
import { mailtoFor, subjectFor } from './domain/post.ts';
import type { Post } from './domain/post.ts';
import { explain } from './domain/trouble.ts';
import { sinceWords } from './domain/seen.ts';
import {
  markEmailed, readApplications, readContest, readEntries, readPosts, removePost, writePost,
} from './store/firestore.ts';
import type { Contest, Manager } from './store/firestore.ts';

/**
 * The board: what the group chat was for, kept next to the thing it is about.
 *
 * A league runs on half a dozen messages a season — the picks are due, so-and-so has not submitted,
 * the round is decided, somebody's kicker has done something unforgivable. In a group chat those
 * scroll away behind photographs of dogs. Here they stay, in order, beside the bracket they are
 * about.
 *
 * Posting and emailing are deliberately two acts rather than one. Everything goes on the board;
 * only the things worth interrupting somebody's evening for go out as mail, and the second is the
 * commissioner's decision even when the asking is not.
 *
 * There is no server here, so nothing can send mail on the league's behalf — that wants a Cloud
 * Function or the Trigger Email extension, and both want the paid plan. What exists instead is a
 * link that opens the commissioner's own mail app with the league already in the blind copy. It is
 * one press rather than none, and it arrives from a person rather than from a robot.
 */

const CONTEST = 'rehearsal-2026';

export function Board({ uid, commissioner }: { uid: string; commissioner: boolean }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [contest, setContest] = useState<Contest | null>(null);
  const [me, setMe] = useState<Manager | null>(null);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [wantsEmail, setWantsEmail] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [found, people, written] = await Promise.all([
        readContest(CONTEST),
        readEntries(CONTEST),
        readPosts(CONTEST),
      ]);
      setContest(found);
      setMe(people.find((person) => person.uid === uid) ?? null);
      setPosts(written);

      // Only the commissioner may read an address, which is also the only person who can send.
      if (commissioner) {
        const applications = await readApplications(CONTEST).catch(() => []);
        setAddresses(applications.map((application) => application.email).filter(Boolean));
      }
    } catch (cause) {
      setProblem(explain(cause));
    }
  }, [uid, commissioner]);

  useEffect(() => { void load(); }, [load]);

  async function post() {
    const said = text.trim();
    if (!said) return;
    setBusy('post');
    setProblem(null);
    try {
      await writePost(CONTEST, {
        uid,
        name: me?.teamName || me?.name || 'Somebody',
        text: said,
        wantsEmail,
      });
      setText('');
      setWantsEmail(false);
      await load();
    } catch (cause) {
      setProblem(explain(cause));
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, work: () => Promise<void>) {
    setBusy(id);
    setProblem(null);
    try {
      await work();
      await load();
    } catch (cause) {
      setProblem(explain(cause));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  if (problem) return <div className="card gate"><p className="problem">{problem}</p></div>;
  if (!posts) return <div className="card gate"><p>Loading the board…</p></div>;

  const waiting = posts.filter((entry) => entry.wantsEmail && !entry.emailedAt).length;

  return (
    <>
      <div className="card">
        <div className="confhead">
          Say something
          <span className="colhead">{posts.length} on the board</span>
        </div>

        <div className="composer">
          <textarea
            value={text}
            rows={3}
            maxLength={2000}
            placeholder="Picks are due Thursday at 5:15…"
            onChange={(event) => setText(event.target.value)}
          />

          <div className="composerfoot">
            {/* Asking is not sending. Anybody may ask; only the commissioner has the addresses. */}
            <label className="askemail">
              <input
                type="checkbox"
                checked={wantsEmail}
                onChange={(event) => setWantsEmail(event.target.checked)}
              />
              <span>
                {commissioner
                  ? 'Worth emailing to the league'
                  : 'Ask the commissioner to email this to the league'}
              </span>
            </label>

            <button className="submit small" disabled={busy === 'post' || !text.trim()} onClick={() => void post()}>
              {busy === 'post' ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </div>

      {commissioner && waiting > 0 && (
        <div className="card notice">
          <strong>{waiting} {waiting === 1 ? 'message is' : 'messages are'} waiting to be emailed.</strong>{' '}
          Each has a button below. It opens your own mail app with the league in the blind copy —
          nothing is sent until you press send there.
        </div>
      )}

      {posts.length === 0 ? (
        <div className="card gate">
          <h2>Nothing on the board</h2>
          <p>First one to say something sets the tone.</p>
        </div>
      ) : (
        posts.map((entry) => {
          const mine = entry.uid === uid;
          return (
            <div className="card post" key={entry.id}>
              <div className="posthead">
                <span className="postwho">
                  {entry.name}
                  {mine && <span className="tag">you</span>}
                </span>
                <span className="postwhen">{sinceWords(entry.at)}</span>
              </div>

              <p className="posttext">{entry.text}</p>

              <div className="postfoot">
                <span className="postmail">
                  {entry.emailedAt
                    ? <span className="emailed">emailed to the league</span>
                    : entry.wantsEmail
                      ? <span className="asking">asked to be emailed</span>
                      : null}
                </span>

                <span className="postacts">
                  {commissioner && !entry.emailedAt && (
                    <a
                      className="ghost small"
                      href={mailtoFor(entry, addresses, subjectFor(entry, contest?.name ?? 'Second Season'))}
                      onClick={() => void act(entry.id, () => markEmailed(CONTEST, entry.id))}
                    >
                      Email to the league
                    </a>
                  )}
                  {(mine || commissioner) && (
                    <button
                      className="danger small"
                      disabled={busy === entry.id}
                      onClick={() => (confirming === entry.id
                        ? void act(entry.id, () => removePost(CONTEST, entry.id))
                        : setConfirming(entry.id))}
                    >
                      {confirming === entry.id ? 'Sure? Delete' : 'Delete'}
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })
      )}

      <p className="footnote">
        Everything said here stays here, in order, next to the bracket it is about. Nothing is
        editable once posted — the delete is there if it needs to go.
        {commissioner && addresses.length === 0 && (
          <> No email addresses are on file yet, so there is nobody to send to. They fill in on
          their own as people sign in.</>
        )}
      </p>
    </>
  );
}
