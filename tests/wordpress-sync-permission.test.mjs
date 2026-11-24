import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizedWordPressWriteMode as permission } from '../lib/wordpress-sync-permission.mjs';

const testId = 'd842722f-b213-4d3c-914d-5702d7ac961e';
const preview = { VERCEL_ENV:'preview', WORDPRESS_SYNC_STAGING_ENABLED:'true', WORDPRESS_SYNC_LIVE_ENABLED:'true', WORDPRESS_SYNC_TEST_EVENT_ID:testId };

test('preview requires exact single event and two enabled switches', () => {
  assert.equal(permission(preview,testId),'preview_single');
  assert.equal(permission(preview,'not-the-test-event'),null);
  assert.equal(permission({...preview,WORDPRESS_SYNC_LIVE_ENABLED:'false'},testId),null);
  assert.equal(permission({...preview,WORDPRESS_SYNC_STAGING_ENABLED:'false'},testId),null);
});

test('production requires its own explicit opt-in, never preview flags', () => {
  assert.equal(permission({...preview,VERCEL_ENV:'production'},testId),null);
  assert.equal(permission({VERCEL_ENV:'production', WORDPRESS_SYNC_PRODUCTION_ENABLED:'false'},testId),null);
  assert.equal(permission({VERCEL_ENV:'production', WORDPRESS_SYNC_PRODUCTION_ENABLED:'true'},testId),'production');
});

test('development and unknown environments are never writable', () => {
  for (const mode of ['development','test',undefined,'']) {
    assert.equal(permission({...preview,VERCEL_ENV:mode, WORDPRESS_SYNC_PRODUCTION_ENABLED:'true'},testId),null);
  }
  assert.equal(permission(null,testId),null);
  assert.equal(permission(preview,''),null);
});
