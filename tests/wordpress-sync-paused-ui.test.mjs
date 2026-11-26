import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../app/api/wordpress-sync/route.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/page.js', import.meta.url), 'utf8');

test('server rejects disabled WordPress writes before touching WordPress config or sending data', () => {
  const gate = route.indexOf('const writeMode = authorizedWordPressWriteMode(process.env, event.id)');
  const wpSecret = route.indexOf('if (!process.env.WORDPRESS_SYNC_ENDPOINT || !process.env.WORDPRESS_SYNC_SECRET)');
  const transport = route.indexOf('sendWordPressEventWithRetry(payload,');
  assert.ok(gate > 0 && wpSecret > gate && transport > wpSecret);
  assert.match(route, /code: 'SYNC_PAUSED'[^\n]*status: 503/);
});

test('event saves remain successful if WordPress is intentionally paused', () => {
  assert.match(page, /if \(result\?\.code === 'SYNC_PAUSED'\) error\.code = 'SYNC_PAUSED'/);
  assert.match(page, /if\(syncError\?\.code==='SYNC_PAUSED'\)/);
  assert.match(page, /イベントは保存しました。ホームページ連携は現在停止中/);
  assert.match(page, /if\(data\.website_published\|\|selected\?\.website_published\)/);
  assert.match(page, /const result=await requestWordPressSync\(data\.id\)/);
});

test('production connection check works independently of event publication flags', () => {
  const check = readFileSync(new URL('../app/api/wordpress-sync/check/route.js', import.meta.url), 'utf8');
  assert.match(check, /process\.env\.VERCEL_ENV === 'production'/);
  assert.match(check, /process\.env\.VERCEL_ENV === 'preview' && process\.env\.WORDPRESS_SYNC_STAGING_ENABLED === 'true'/);
  assert.doesNotMatch(check, /process\.env\.WORDPRESS_SYNC_PRODUCTION_ENABLED/);
  assert.doesNotMatch(check, /process\.env\.WORDPRESS_SYNC_LIVE_ENABLED/);
  assert.match(check, /action: 'unpublish'/);
  assert.match(check, /sendWordPressEventWithRetry\(payload,/);
  assert.match(check, /code: 'wp_configuration'/);
});
