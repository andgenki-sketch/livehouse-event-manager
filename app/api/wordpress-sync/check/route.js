import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sendWordPressEventWithRetry } from '../../../../lib/wordpress-sync-transport.mjs';
import { classifyWordPressConnectionFailure } from '../../../../lib/wordpress-sync-diagnostics.mjs';

export const runtime = 'nodejs';

/**
 * Owner-only WordPress connection probe. It never queries or changes events in
 * Supabase and requires the WordPress receiver to acknowledge dry_run=true.
 */
export async function POST(request) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer [^\s]+$/.test(authorization)) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) {
    return Response.json({ error: 'Server is not configured' }, { status: 503 });
  }
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await supabase.auth.getUser(authorization.slice(7));
  if (error || !data?.user) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { data: owner, error: permissionError } = await supabase
    .from('team_members')
    .select('role')
    .eq('user_id', data.user.id)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();
  if (permissionError || !owner) {
    return Response.json({ error: 'Owner permission required' }, { status: 403 });
  }
  if (process.env.WORDPRESS_SYNC_STAGING_ENABLED !== 'true' ||
      !process.env.WORDPRESS_SYNC_ENDPOINT || !process.env.WORDPRESS_SYNC_SECRET) {
    return Response.json({ error: 'WordPress preview sync is not configured' }, { status: 503 });
  }
  // A random never-used ID and unpublish action keep the probe harmless even
  // if a future receiver accidentally enables writes. Dry-run is mandatory.
  const payload = { external_id: 'tsa-probe-' + randomBytes(16).toString('hex'), action: 'unpublish' };
  try {
    const result = await sendWordPressEventWithRetry(payload, {
      endpoint: process.env.WORDPRESS_SYNC_ENDPOINT,
      secret: process.env.WORDPRESS_SYNC_SECRET
    });
    return Response.json({ connected: true, dry_run: result.dry_run });
  } catch (error) {
    return Response.json({ error: 'WordPress connection failed', code: classifyWordPressConnectionFailure(error) }, { status: 502 });
  }
}
