/**
 * Safe, bounded error categories for owner-only WordPress connection checks.
 * Deliberately never return raw error messages, request bodies or credentials.
 */
export function classifyWordPressConnectionFailure(error) {
  const message = error instanceof Error ? error.message : '';
  const status = /^WordPress sync HTTP ([0-9]{3})$/.exec(message);
  if (status) {
    const httpStatus = Number(status[1]);
    if ([401, 403, 404, 405, 409, 429].includes(httpStatus)) {
      return 'wp_http_' + httpStatus;
    }
    if (httpStatus >= 500 && httpStatus <= 599) return 'wp_http_5xx';
    return 'wp_http_other';
  }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'wp_timeout';
  if (error instanceof TypeError) return 'wp_network_or_tls';
  if (message === 'Unexpected WordPress sync response' ||
      message === 'WordPress receiver unexpectedly performed a write') return 'wp_unexpected_response';
  if (message === 'Invalid WordPress endpoint' || message === 'WordPress endpoint is not configured' ||
      message === 'Missing WordPress sync secret') return 'wp_configuration';
  return 'wp_unknown';
}
