import { createClient } from '@supabase/supabase-js';
import { projectWordPressEvent } from '../../../lib/wordpress-event-projection.mjs';
import { sendWordPressEventWithRetry } from '../../../lib/wordpress-sync-transport.mjs';
import { classifyWordPressConnectionFailure } from '../../../lib/wordpress-sync-diagnostics.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow WordPress to validate and import a <=5MB flyer.

/**
 * Staging-only server action. The caller supplies an event ID, never event data.
 * All event fields and membership permissions are re-read from Supabase.
 * No WordPress mutation is possible while the receiver is in dry-run mode.
 */
export async function POST(request) {
  const tokenHeader = request.headers.get('authorization') || '';
  if (!/^Bearer [^\s]+$/.test(tokenHeader)) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return Response.json({ error: 'Server is not configured' }, { status: 503 });
  }
  const client = createClient(url, publishableKey, {
    global: { headers: { Authorization: tokenHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const token = tokenHeader.slice(7);
  const { data: identity, error: authError } = await client.auth.getUser(token);
  if (authError || !identity?.user) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
  const eventId = body?.event_id;
  if (typeof eventId !== 'string' || !/^[0-9a-f-]{36}$/i.test(eventId)) {
    return Response.json({ error: 'Invalid event ID' }, { status: 400 });
  }
  const { data: event, error: eventError } = await client
    .from('events')
    .select('id,team_id,title,event_date,open_time,start_time,venue,advance_price,door_price,public_description,flyer_path,website_published,website_pickup')
    .eq('id', eventId)
    .maybeSingle();
  if (eventError || !event) return Response.json({ error: 'Event unavailable' }, { status: 404 });
  const { data: member, error: memberError } = await client
    .from('team_members')
    .select('role')
    .eq('team_id', event.team_id)
    .eq('user_id', identity.user.id)
    .maybeSingle();
  if (memberError || !['owner', 'member'].includes(member?.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (process.env.WORDPRESS_SYNC_STAGING_ENABLED !== 'true') {
    return Response.json({ error: 'WordPress sync is disabled until staging is approved' }, { status: 503 });
  }
  if (!process.env.WORDPRESS_SYNC_ENDPOINT || !process.env.WORDPRESS_SYNC_SECRET) {
    return Response.json({ error: 'WordPress staging integration is not configured' }, { status: 503 });
  }
  let payload;
  try { payload = projectWordPressEvent(event); }
  catch { return Response.json({ error: 'Invalid public event data' }, { status: 422 }); }
  // Live publication is a separate opt-in after the WordPress single-event trial.
  const liveEnabled = process.env.WORDPRESS_SYNC_LIVE_ENABLED === 'true';
  // Fail closed BEFORE contacting WordPress. The trial is preview-only and
  // locked to one explicitly approved event ID, even if WordPress is in write mode.
  if (process.env.VERCEL_ENV !== 'preview' || !liveEnabled) {
    return Response.json({ error: 'WordPress writes are paused outside the approved preview trial' }, { status: 503 });
  }
  if (process.env.WORDPRESS_SYNC_TEST_EVENT_ID !== event.id) {
    return Response.json({ error: 'This event is not allowed in the WordPress publication trial' }, { status: 403 });
  }
  try {
    const result = await sendWordPressEventWithRetry(payload, {
      endpoint: process.env.WORDPRESS_SYNC_ENDPOINT,
      secret: process.env.WORDPRESS_SYNC_SECRET,
      requireDryRun: !liveEnabled
    });
    if (liveEnabled && result.dry_run !== false) {
      return Response.json({ error: 'WordPress publication has not been enabled on the site' }, { status: 409 });
    }
    return Response.json({ accepted: true, dry_run: result.dry_run, event_id: event.id, post_id: result.post_id || null, featured_image_id: result.featured_image_id || null });
  } catch (error) {
    return Response.json({
      error: 'WordPress event sync failed',
      code: classifyWordPressConnectionFailure(error),
      wordpress_code: typeof error?.wordpressCode === 'string' ? error.wordpressCode : null
    }, { status: 502 });
  }
}
