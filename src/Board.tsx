import { useCallback, useEffect, useRef, useState } from 'react';
import type { Post } from './domain/post.ts';
import { explain } from './domain/trouble.ts';
import { Editor } from './Editor.tsx';
import type { EditorHandle } from './Editor.tsx';
import { Markup } from './Markup.tsx';
import { sinceWords } from './domain/seen.ts';
import { readEntries, readPosts, removePost, writePost } from './store/firestore.ts';
import type { Manager } from './store/firestore.ts';

/**
 * The board: what the group chat was for, kept next to the thing it is about.
 *
 * A league runs on half a dozen messages a season — the picks are due, so-and-so has not submitted,
 * the round is decided, somebody's kicker has done something unforgivable. In a group chat those
 * scroll away behind photographs of dogs. Here they stay, in order, beside the bracket they are
 * about.
 *
 * Emailing is off for now. The mailto route worked but put a button on every post to do a thing
 * the app cannot actually do by itself, which is a lot of furniture for one press of send in
 * somebody else's mail app. domain/post.ts still has the whole of it, and the wantsEmail field is
 * still written, so it comes back on the day there is a plan that can send properly.
 */

const CONTEST = 'rehearsal-2026';

export function Board({ uid, commissioner }: { uid: string; commissioner: boolean }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [me, setMe] = useState<Manager | null>(null);
  const [hasText, setHasText] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const editor = useRef<EditorHandle | null>(null);

  const load = useCallback(async () => {
    try {
      const [people, written] = await Promise.all([readEntries(CONTEST), readPosts(CONTEST)]);
      setMe(people.find((person) => person.uid === uid) ?? null);
      setPosts(written);
    } catch (cause) {
      setProblem(explain(cause));
    }
  }, [uid]);

  useEffect(() => { void load(); }, [load]);

  async function post() {
    const said = editor.current?.marks().trim() ?? '';
    if (!said) return;
    setBusy('post');
    setProblem(null);
    try {
      await writePost(CONTEST, {
        uid,
        name: me?.teamName || me?.name || 'Somebody',
        text: said,
        wantsEmail: false,
      });
      editor.current?.clear();
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

  return (
    <>
      <div className="card">
        <div className="confhead">
          Say something
          <span className="colhead">{posts.length} on the board</span>
        </div>

        <div className="composer">
          <Editor
            handle={editor}
            placeholder="Picks are due Thursday at 5:15."
            onChange={setHasText}
          />

          <div className="composerfoot">
            <span className="composerhint">
              Select what you want changed and press a button, or paste it in already formatted.
            </span>
            <button className="submit small" disabled={busy === 'post' || !hasText} onClick={() => void post()}>
              {busy === 'post' ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </div>

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

              <Markup text={entry.text} />

              <div className="postfoot">
                <span className="postacts">
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
      </p>
    </>
  );
}
