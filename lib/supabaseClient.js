import { createClient } from '@supabase/supabase-js';

// These two values come from Vercel's Environment Variables, not typed
// directly here. See the README for how to set them up.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;

// Next.js App Router's fetch-patching caches GET requests by default, which
// reaches into supabase-js's internal reads even with `dynamic =
// 'force-dynamic'` on the route (see lib/supabaseAdmin.js for how this was
// found). Forcing 'no-store' here too so the homepage can't serve a stale
// snapshot after a cron/backfill run.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
  },
});
