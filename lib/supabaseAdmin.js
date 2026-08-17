import { createClient } from '@supabase/supabase-js';

// Service-role client for server-only routes (cron, backfill) that need to
// write regardless of RLS policy. Never import this from anything reachable
// by the browser -- lib/supabaseClient.js (anon key) is what app/page.js uses.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Next.js App Router's fetch-patching caches GET requests by default, and
// that reached into supabase-js's internal reads even with `dynamic =
// 'force-dynamic'` on the route -- backfill kept re-fetching the exact same
// stale batch of rows across separate requests despite writes committing
// fine (mutations aren't GET, so they weren't cached). Forcing 'no-store'
// on every request this client makes is the documented fix.
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  global: {
    fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
  },
});
