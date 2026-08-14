import { createClient } from '@supabase/supabase-js';

// These two values come from Vercel's Environment Variables, not typed
// directly here. See the README for how to set them up.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
