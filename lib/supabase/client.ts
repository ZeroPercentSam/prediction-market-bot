import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client with service role key (for cron jobs / API routes)
let serverClient: SupabaseClient | null = null;

export function createServerClient() {
  if (serverClient) return serverClient;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  serverClient = createClient(supabaseUrl, serviceRoleKey);
  return serverClient;
}
