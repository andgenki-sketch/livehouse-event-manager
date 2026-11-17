import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWordPressConnectionFailure as classify, wordpressKeyFingerprint } from '../lib/wordpress-sync-diagnostics.mjs';

test('reports sanitized WordPress HTTP errors', () => {
  assert.equal(classify(new Error('WordPress sync HTTP 401')), 'wp_http_401');
  assert.equal(classify(new Error('WordPress sync HTTP 404')), 'wp_http_404');
  assert.equal(classify(new Error('WordPress sync HTTP 409')), 'wp_http_409');
  assert.equal(classify(new Error('WordPress sync HTTP 503')), 'wp_http_5xx');
});
test('never echoes raw exception messages or secrets', () => {
  const secret = 'my-super-secret-string';
  const code = classify(new Error('A diagnostic that includes ' + secret));
  assert.equal(code, 'wp_unknown');
  assert.equal(code.includes(secret), false);
});
test('distinguishes network, timeout and response errors', () => {
  assert.equal(classify(new TypeError('fetch failed')), 'wp_network_or_tls');
  assert.equal(classify(Object.assign(new Error('Timed out'), { name: 'TimeoutError' })), 'wp_timeout');
  assert.equal(classify(new Error('Unexpected WordPress sync response')), 'wp_unexpected_response');
});

test('key fingerprint agrees with PHP HMAC and never returns a raw key', () => {
  const secret = 'a'.repeat(40);
  assert.equal(wordpressKeyFingerprint(secret), '5C725B8CEE24');
  assert.equal(wordpressKeyFingerprint('short'), null);
  assert.notEqual(wordpressKeyFingerprint(secret), secret);
});
