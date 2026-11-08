const test = require('node:test');
const assert = require('node:assert/strict');
const { mailRange, mailboxSearch, inMailRange, storedMailRange } = require('../utils/crm2MailRange');

test('mailbox search widens day boundaries and exact matching uses inclusive instants', () => {
  const range = mailRange({ from: '2026-11-08T09:30:00+05:30', to: '2026-11-08T11:30:00+05:30' });
  const search = mailboxSearch(range);
  assert.ok(search.since < range.$gte);
  assert.ok(search.before > range.$lte);
  assert.equal(inMailRange('2026-11-08T04:00:00Z', range), true);
  assert.equal(inMailRange('2026-11-08T06:00:00Z', range), true);
  assert.equal(inMailRange('2026-11-08T06:00:01Z', range), false);
  assert.equal(inMailRange(null, range), false);
  assert.equal(inMailRange(null, mailRange()), true);
  assert.deepEqual(storedMailRange(range).$or[2], { receivedat: null, sentat: null, createdAt: range });
  assert.throws(() => mailRange({ from: 'bad-date' }), /valid date/);
  assert.throws(() => mailRange({ from: '2026-11-09', to: '2026-11-08' }), /must not be after/);
});
