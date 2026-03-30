import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Make sure it is set in your .env.local or deployment environment.`
    );
  }
  return value;
}

const supabaseUrl = getEnvVar("NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client with service role key (for cron jobs / API routes)
let serverClient: SupabaseClient | null = null;

export function createServerClient() {
  if (serverClient) return serverClient;

  const serviceRoleKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");
  serverClient = createClient(supabaseUrl, serviceRoleKey);
  return serverClient;
}
