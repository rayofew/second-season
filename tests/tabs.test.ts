import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashFor, tabFromHash, TABS } from '../src/domain/tabs.ts';

describe('which screen the address bar points at', () => {
  it('reads every tab back from its own hash', () => {
    for (const tab of TABS) assert.equal(tabFromHash(hashFor(tab)), tab);
  });

  it('copes with a hash written by hand', () => {
    assert.equal(tabFromHash('#LIVE'), 'live');
    assert.equal(tabFromHash('#/live'), 'live');
    assert.equal(tabFromHash('live'), 'live');
  });

  it('opens the app rather than an error for anything it does not know', () => {
    // A retyped link, a hash left over from an older version, or no hash at all.
    assert.equal(tabFromHash(''), 'home');
    assert.equal(tabFromHash('#'), 'home');
    assert.equal(tabFromHash('#lab'), 'home', 'a tab that used to exist');
    assert.equal(tabFromHash('#<script>'), 'home');
  });
});
