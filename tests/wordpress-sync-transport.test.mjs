import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signedWordPressRequest, sendWordPressEvent } from '../lib/wordpress-sync-transport.mjs';

const secret = 'a'.repeat(40);
const payload = { external_id: 'test-event', action: 'unpublish' };
test('signs the exact JSON request body', () => {
  const signed = signedWordPressRequest(payload, secret, 1790000000);
  const expected = createHmac('sha256', secret).update('1790000000.' + signed.body).digest('hex');
  assert.equal(signed.headers['x-tsa-signature'], 'sha256=' + expected);
});
test('refuses insecure endpoints', async () => {
  await assert.rejects(sendWordPressEvent(payload, { endpoint: 'http://example.com/wp-json/tsa-sync/v1/events', secret }));
});
test('accepts only matching dry-run acknowledgment', async () => {
  const endpoint = 'https://example.com/wp-json/tsa-sync/v1/events';
  const fetcher = async (_url, options) => {
    assert.equal(options.method, 'POST');
    return { ok: true, json: async () => ({ accepted: true, dry_run: true, ...payload }) };
  };
  const result = await sendWordPressEvent(payload, { endpoint, secret, fetcher });
  assert.equal(result.dry_run, true);
});
test('rejects a response that falsely implies a real publication', async () => {
  const endpoint = 'https://example.com/wp-json/tsa-sync/v1/events';
  await assert.rejects(sendWordPressEvent(payload, {
    endpoint, secret,
    fetcher: async () => ({ ok: true, json: async () => ({ accepted: true, dry_run: false, ...payload }) })
  }));
});
