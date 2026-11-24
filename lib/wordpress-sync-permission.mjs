/**
 * WordPress publication is disabled by default in every environment.
 * Preview: explicitly approved single event only.
 * Production: independent opt-in, AFTER WordPress canary verification.
 * Never infer write permission from a public-facing flag.
 */
export function authorizedWordPressWriteMode(env, eventId) {
  if (!env || typeof eventId !== 'string' || !eventId) return null;
  if (env.VERCEL_ENV === 'preview') {
    return env.WORDPRESS_SYNC_STAGING_ENABLED === 'true' &&
      env.WORDPRESS_SYNC_LIVE_ENABLED === 'true' &&
      typeof env.WORDPRESS_SYNC_TEST_EVENT_ID === 'string' &&
      env.WORDPRESS_SYNC_TEST_EVENT_ID === eventId
      ? 'preview_single' : null;
  }
  if (env.VERCEL_ENV === 'production') {
    return env.WORDPRESS_SYNC_PRODUCTION_ENABLED === 'true'
      ? 'production' : null;
  }
  return null;
}
