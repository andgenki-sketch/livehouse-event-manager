import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signedWordPressRequest, sendWordPressEvent, sendWordPressEventWithRetry } from '../lib/wordpress-sync-transport.mjs';

const secret = 'a'.repeat(40);
const payload = { external_id: 'test-event', action: 'unpublish' };
test('signs the exact JSON request body', () => {
  const signed = signedWordPressRequest(payload, secret, 1790000000, 'b'.repeat(32));
  const expected = createHmac('sha256', secret).update('1790000000.' + 'b'.repeat(32) + '.' + signed.body).digest('hex');
  assert.equal(signed.headers['x-tsa-signature'], 'sha256=' + expected);
  assert.equal(signed.headers['x-tsa-nonce'], 'b'.repeat(32));
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

test('signed requests have distinct replay nonces', () => {
  const first = signedWordPressRequest(payload, secret);
  const second = signedWordPressRequest(payload, secret);
  assert.notEqual(first.headers['x-tsa-nonce'], second.headers['x-tsa-nonce']);
});

test('retries transient server errors with a new nonce', async () => {
  let calls = 0;
  const nonces = [];
  const fetcher = async (_url, options) => {
    calls++;
    nonces.push(options.headers['x-tsa-nonce']);
    if (calls === 1) return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ accepted: true, dry_run: true, ...payload }) };
  };
  const result = await sendWordPressEventWithRetry(payload, {
    endpoint: 'https://example.com/wp-json/tsa-sync/v1/events', secret, fetcher
  });
  assert.equal(result.accepted, true);
  assert.equal(calls, 2);
  assert.notEqual(nonces[0], nonces[1]);
});

test('does not retry validation failures', async () => {
  let calls = 0;
  await assert.rejects(sendWordPressEventWithRetry(payload, {
    endpoint: 'https://example.com/wp-json/tsa-sync/v1/events', secret,
    fetcher: async () => { calls++; return { ok: false, status: 400 }; }
  }));
  assert.equal(calls, 1);
});
