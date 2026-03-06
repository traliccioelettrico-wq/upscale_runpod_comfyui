import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type ConnectionRow = Database["public"]["Tables"]["connections"]["Row"];

export function createServerClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Fetches the active connection from the server side.
 * Returns null if no active connection exists.
 * Uses explicit type assertion to work around supabase-js v2 type inference.
 */
export async function getActiveConnectionServer(): Promise<ConnectionRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as ConnectionRow;
}
