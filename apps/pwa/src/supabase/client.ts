import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface Configuration {
  url: string;
  anonKey: string;
}

/**
 * The environment is read inside the functions, never at module scope, so a test can stub it
 * and a missing configuration is an ordinary state rather than an import-time failure.
 */
function readConfiguration(): Configuration | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url, anonKey } : null;
}

let cached: { configuration: Configuration; client: SupabaseClient } | null = null;

/** Whether both Supabase variables are set. When false, the app runs as editor and draft only. */
export function isSupabaseConfigured(): boolean {
  return readConfiguration() !== null;
}

/**
 * The one door to the network: a client memoised per resolved configuration, or `null` when the
 * app is not configured.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const configuration = readConfiguration();
  if (!configuration) return null;
  if (
    cached &&
    cached.configuration.url === configuration.url &&
    cached.configuration.anonKey === configuration.anonKey
  ) {
    return cached.client;
  }
  const client = createClient(configuration.url, configuration.anonKey, {
    auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  cached = { configuration, client };
  return client;
}
