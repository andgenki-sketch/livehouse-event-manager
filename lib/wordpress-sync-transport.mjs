import { randomBytes } from 'node:crypto';
import { createHmac } from 'node:crypto';

/**
 * Server-side transport only. Never import into client components.
 * The endpoint must be configured as a trusted HTTPS WordPress REST route.
 */
export function signedWordPressRequest(payload, secret, timestamp = Math.floor(Date.now() / 1000), nonce = randomBytes(16).toString('hex')) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Missing WordPress sync secret');
  if (!Number.isSafeInteger(timestamp) || timestamp < 1000000000) throw new Error('Invalid timestamp');
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Invalid nonce');
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', secret).update(String(timestamp) + '.' + nonce + '.' + body).digest('hex');
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'x-tsa-timestamp': String(timestamp),
      'x-tsa-nonce': nonce,
      'x-tsa-signature': 'sha256=' + signature
    }
  };
}

export async function sendWordPressEvent(payload, options = {}) {
  const endpoint = options.endpoint;
  const secret = options.secret;
  if (typeof endpoint !== 'string') throw new Error('WordPress endpoint is not configured');
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.pathname !== '/wp-json/tsa-sync/v1/events') {
    throw new Error('Invalid WordPress endpoint');
  }
  const { body, headers } = signedWordPressRequest(payload, secret);
  const fetcher = options.fetcher || fetch;
  const response = await fetcher(url.toString(), {
    method: 'POST',
    headers,
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('WordPress sync HTTP ' + response.status);
  const result = await response.json();
  if (!result || result.accepted !== true || typeof result.dry_run !== 'boolean' ||
      result.external_id !== payload.external_id || result.action !== payload.action) {
    throw new Error('Unexpected WordPress sync response');
  }
  if (options.requireDryRun !== false && result.dry_run !== true) {
    throw new Error('WordPress receiver unexpectedly performed a write');
  }
  return result;
}
