import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mailtoFor, subjectFor } from '../src/domain/post.ts';
import type { Post } from '../src/domain/post.ts';

const post = (text: string): Post => ({
  id: 'p1', uid: 'u1', name: 'Ray R.', text, at: new Date('2026-09-20T10:00:00'), wantsEmail: true,
});

describe('emailing a post to the league', () => {
  it('puts everybody in the blind copy and nobody in the To line', () => {
    // A reply-all from fifteen people is how a mailing list dies — and an address somebody gave
    // the commissioner was not given to the other fourteen.
    const link = mailtoFor(post('Picks due Thursday'), ['a@b.com', 'c@d.com'], 'Second Season');
    assert.ok(link.startsWith('mailto:?'), link.slice(0, 20));
    assert.match(link, /bcc=a%40b.com%2Cc%40d.com/);
    assert.ok(!/[?&]to=/.test(link), 'nobody in the To line');
  });

  it('drops duplicates and blanks, which a half-filled league is full of', () => {
    const link = mailtoFor(post('x'), ['a@b.com', '', 'a@b.com', 'c@d.com'], 'S');
    const bcc = new URL(link).searchParams.get('bcc');
    assert.equal(bcc, 'a@b.com,c@d.com');
  });

  it('encodes a space as a space and not as a plus', () => {
    // URLSearchParams uses '+', which a mail client shows as a literal plus sign in the subject.
    const link = mailtoFor(post('Two words'), ['a@b.com'], 'Wild Card');
    assert.ok(!link.includes('+'), 'no raw plus signs in the link');
    assert.equal(new URL(link).searchParams.get('subject'), 'Wild Card');
  });

  it('trims a very long post rather than losing the end of the link', () => {
    // Mail clients start dropping the rest of a mailto somewhere past two thousand characters,
    // and a silently truncated message is worse than one that says it was truncated.
    const link = mailtoFor(post('x'.repeat(4000)), ['a@b.com'], 'S');
    const body = new URL(link).searchParams.get('body') ?? '';
    assert.ok(body.length < 2000, `body was ${body.length}`);
    assert.match(body, /The rest is on the board/);
  });

  it('signs it, so it does not arrive from nobody', () => {
    const body = new URL(mailtoFor(post('Hello'), ['a@b.com'], 'S')).searchParams.get('body') ?? '';
    assert.match(body, /— Ray R\./);
    assert.match(body, /playoffs\.spiteapps\.app/);
  });
});

describe('the subject line', () => {
  it('names the league and the first line of the message', () => {
    assert.equal(subjectFor(post('Picks due Thursday\nno excuses'), 'Second Season'),
      'Second Season: Picks due Thursday');
  });

  it('shortens a first line that is really a paragraph', () => {
    const subject = subjectFor(post('x'.repeat(200)), 'Second Season');
    assert.ok(subject.length < 80, subject);
    assert.ok(subject.endsWith('…'));
  });

  it('falls back to the league alone when somebody opens with a blank line', () => {
    assert.equal(subjectFor(post('\n\nthe actual message'), 'Second Season'), 'Second Season');
  });
});
