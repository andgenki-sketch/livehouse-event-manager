import { createClient } from '@supabase/supabase-js';
import { projectWordPressEvent } from '../../../lib/wordpress-event-projection.mjs';
import { sendWordPressEventWithRetry } from '../../../lib/wordpress-sync-transport.mjs';

export const runtime = 'nodejs';

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
  try {
    const result = await sendWordPressEventWithRetry(payload, {
      endpoint: process.env.WORDPRESS_SYNC_ENDPOINT,
      secret: process.env.WORDPRESS_SYNC_SECRET
    });
    return Response.json({ accepted: true, dry_run: result.dry_run, event_id: event.id });
  } catch {
    return Response.json({ error: 'WordPress staging sync failed' }, { status: 502 });
  }
}
