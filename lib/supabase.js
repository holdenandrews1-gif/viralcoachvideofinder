import { createClient } from '@supabase/supabase-js';

let _client = null;

/**
 * Lazy Supabase client. We construct on first access so that build-time
 * page-data collection (which runs without env vars) doesn't crash.
 */
function getSupabase() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// Proxy so existing `supabase.from(...)` calls still work.
export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getSupabase();
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
  }
);
