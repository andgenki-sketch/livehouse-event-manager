import test from 'node:test';
import assert from 'node:assert/strict';
import { projectWordPressEvent } from '../lib/wordpress-event-projection.mjs';

const sample = {
  id: 'event-123',
  title: 'Test Live',
  event_date: '2026-12-10',
  open_time: '18:30:00',
  start_time: '19:00:00',
  venue: 'Thunder Snake ATSUGI',
  advance_price: 3000,
  door_price: 3500,
  public_description: 'Public information',
  flyer_path: 'team/flyer.png',
  website_published: true,
  website_pickup: true,
  hall_rental_fee: 100000,
  day_notes: 'Private notes',
  team_id: 'internal-team'
};

test('published event contains only public fields', () => {
  const result = projectWordPressEvent(sample);
  assert.equal(result.action, 'upsert');
  assert.equal(result.open_time, '18:30');
  assert.equal(result.pickup, true);
  for (const key of ['hall_rental_fee', 'day_notes', 'team_id']) {
    assert.equal(Object.hasOwn(result, key), false);
  }
});

test('unpublished event has no public or private details', () => {
  assert.deepEqual(
    projectWordPressEvent({ ...sample, website_published: false }),
    { external_id: 'event-123', action: 'unpublish' }
  );
});

test('rejects malformed dates, times and prices', () => {
  assert.throws(() => projectWordPressEvent({ ...sample, event_date: '2026-02-30' }));
  assert.throws(() => projectWordPressEvent({ ...sample, start_time: '25:00' }));
  assert.throws(() => projectWordPressEvent({ ...sample, advance_price: -1 }));
});

test('requires an explicit true publication flag', () => {
  assert.equal(
    projectWordPressEvent({ ...sample, website_published: 'true' }).action,
    'unpublish'
  );
});
