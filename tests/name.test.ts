import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fullName, shortName, splitName } from '../src/domain/name.ts';

describe('how a manager is named to the league', () => {
  it('gives the first name and the last initial', () => {
    assert.equal(shortName('Ray', 'Reznick'), 'Ray R.');
    assert.equal(shortName('dave', 'kessler'), 'dave K.', 'the initial is capitalised, the name is left alone');
  });

  it('copes with only half a name', () => {
    assert.equal(shortName('Ray', ''), 'Ray', 'no surname, no initial, no stray full stop');
    assert.equal(shortName('', 'Reznick'), 'Reznick');
    assert.equal(shortName('  ', ' '), '');
  });

  it('takes the initial of a surname that starts with a particle', () => {
    assert.equal(shortName('Mary', 'van der Berg'), 'Mary V.');
  });

  it('handles a surname whose first character is not a plain letter', () => {
    // Spread rather than charAt, so a surname beginning with an accented or non-Latin character
    // gives back that whole character instead of half of a surrogate pair.
    assert.equal(shortName('Nils', 'Ørsted'), 'Nils Ø.');
    assert.equal(shortName('Yuki', '大野'), 'Yuki 大.');
  });

  it('joins both halves for the commissioner', () => {
    assert.equal(fullName('Ray', 'Reznick'), 'Ray Reznick');
    assert.equal(fullName('Ray', ''), 'Ray', 'and does not leave a trailing space');
  });

  it('splits a name that arrived as one string', () => {
    assert.deepEqual(splitName('Ray Reznick'), { first: 'Ray', last: 'Reznick' });
  });

  it('keeps a multi-word surname whole', () => {
    // Everything after the first word is the surname, so she is not told her last name is Anne.
    assert.deepEqual(splitName('Mary Anne Van Der Berg'), { first: 'Mary', last: 'Anne Van Der Berg' });
  });

  it('leaves the surname empty when only one word arrived', () => {
    assert.deepEqual(splitName('Cher'), { first: 'Cher', last: '' });
    assert.deepEqual(splitName('   '), { first: '', last: '' });
  });
});
