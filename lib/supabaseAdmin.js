import { createClient } from '@supabase/supabase-js';

// Service-role client for server-only routes (cron, backfill) that need to
// write regardless of RLS policy. Never import this from anything reachable
// by the browser -- lib/supabaseClient.js (anon key) is what app/page.js uses.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
