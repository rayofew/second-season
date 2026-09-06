import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dialable, formatPhone, typingPhone } from '../src/domain/phone.ts';

describe('phone numbers', () => {
  it('writes a ten digit number the way people read it', () => {
    assert.equal(formatPhone('4254714580'), '(425) 471-4580');
    assert.equal(formatPhone('425 471 4580'), '(425) 471-4580');
    assert.equal(formatPhone('425.471.4580'), '(425) 471-4580');
    assert.equal(formatPhone('14254714580'), '(425) 471-4580', 'a leading one is a country code');
  });

  it('leaves anything it does not recognize alone', () => {
    // Better an unfamiliar number shown as typed than one mangled into a shape it does not have.
    assert.equal(formatPhone('+44 7700 900123'), '+44 7700 900123');
    assert.equal(formatPhone('12345'), '12345');
    assert.equal(formatPhone(''), '');
  });

  it('formats while somebody is still typing', () => {
    assert.equal(typingPhone('4'), '4');
    assert.equal(typingPhone('425'), '425');
    assert.equal(typingPhone('4254'), '(425) 4', 'the bracket closes once the area code is done');
    assert.equal(typingPhone('425471'), '(425) 471');
    assert.equal(typingPhone('4254714'), '(425) 471-4', 'and the dash only once something follows it');
    assert.equal(typingPhone('42547145801234'), '(425) 471-4580', 'extra digits are refused');
  });

  it('gives a dialable form for the sms link', () => {
    assert.equal(dialable('(425) 471-4580'), '+14254714580');
    assert.equal(dialable('1 425 471 4580'), '+14254714580');
  });
});
