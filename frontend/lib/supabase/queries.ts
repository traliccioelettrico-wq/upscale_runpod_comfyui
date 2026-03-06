/**
 * Supabase query helpers with explicit return types.
 * Uses `as any` casts for mutation values to work around supabase-js v2 type
 * inference issues with complex Database generics.
 */
import { createClient } from "./client";
import type { Database } from "./types";

type ConnectionRow = Database["public"]["Tables"]["connections"]["Row"];
type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type JobInsert = Database["public"]["Tables"]["jobs"]["Insert"];

// ─── Connections ──────────────────────────────────────────────────────────────

export async function getActiveConnection(): Promise<ConnectionRow | null> {
  const supabase = createClient();
  const { data, error } = await (supabase as any)
    .from("connections")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`Errore lettura connessione: ${error.message}`);
  return (data as ConnectionRow | null) ?? null;
}

export async function getAllConnections(): Promise<ConnectionRow[]> {
  const supabase = createClient();
  const { data, error } = await (supabase as any)
    .from("connections")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Errore lettura connessioni: ${error.message}`);
  return (data as ConnectionRow[]) ?? [];
}

export async function saveConnection(
  conn: Database["public"]["Tables"]["connections"]["Insert"]
): Promise<ConnectionRow> {
  const supabase = createClient();
  const { data, error } = await (supabase as any)
    .from("connections")
    .insert(conn)
    .select()
    .single();
  if (error) throw new Error(`Errore salvataggio connessione: ${error.message}`);
  return data as ConnectionRow;
}

export async function updateConnection(
  id: string,
  updates: Database["public"]["Tables"]["connections"]["Update"]
): Promise<void> {
  const supabase = createClient();
  const { error } = await (supabase as any)
    .from("connections")
    .update(updates)
    .eq("id", id);
  if (error) throw new Error(`Errore aggiornamento connessione: ${error.message}`);
}

export async function deleteConnection(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await (supabase as any)
    .from("connections")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`Errore eliminazione connessione: ${error.message}`);
}

/**
 * Attiva una connessione disattivando quella precedentemente attiva.
 */
export async function setActiveConnection(connectionId: string): Promise<void> {
  const supabase = createClient();
  await (supabase as any)
    .from("connections")
    .update({ is_active: false })
    .eq("is_active", true)
    .neq("id", connectionId);
  const { error } = await (supabase as any)
    .from("connections")
    .update({ is_active: true })
    .eq("id", connectionId);
  if (error) throw new Error(`Errore attivazione connessione: ${error.message}`);
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

/**
 * Inserisce o aggiorna un job per remote_job_id.
 * Il connection_id viene risolto dalla connessione attiva.
 */
export async function upsertJob(
  params: Omit<JobInsert, "connection_id">
): Promise<void> {
  const supabase = createClient();
  // Resolve connection_id from active connection
  const { data: connData } = await (supabase as any)
    .from("connections")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  const connectionId: string =
    (connData as { id: string } | null)?.id ?? "00000000-0000-0000-0000-000000000000";

  const { error } = await (supabase as any)
    .from("jobs")
    .upsert(
      { connection_id: connectionId, ...params },
      { onConflict: "remote_job_id" }
    );
  if (error) throw new Error(`Errore upsert job: ${error.message}`);
}

export async function syncJobFromRemote(
  remoteJobId: string,
  updates: {
    status?: string;
    progress?: number;
    current_node?: string | null;
    elapsed_seconds?: number;
    message?: string | null;
    output_remote_filename?: string | null;
    completed_at?: string | null;
  }
): Promise<void> {
  const supabase = createClient();
  const { error } = await (supabase as any)
    .from("jobs")
    .update(updates)
    .eq("remote_job_id", remoteJobId);
  if (error) throw new Error(`Errore sync job: ${error.message}`);
}

export async function getJobHistory(limit = 50): Promise<JobRow[]> {
  const supabase = createClient();
  const { data, error } = await (supabase as any)
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Errore lettura storico job: ${error.message}`);
  return (data as JobRow[]) ?? [];
}

export async function getJobByRemoteId(remoteJobId: string): Promise<JobRow | null> {
  const supabase = createClient();
  const { data, error } = await (supabase as any)
    .from("jobs")
    .select("*")
    .eq("remote_job_id", remoteJobId)
    .maybeSingle();
  if (error) throw new Error(`Errore lettura job: ${error.message}`);
  return (data as JobRow | null) ?? null;
}

export async function deleteJobLocal(remoteJobId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await (supabase as any)
    .from("jobs")
    .delete()
    .eq("remote_job_id", remoteJobId);
  if (error) throw new Error(`Errore eliminazione job locale: ${error.message}`);
}

// ─── Preferences ──────────────────────────────────────────────────────────────

export async function getPreference<T = unknown>(key: string): Promise<T | null> {
  const supabase = createClient();
  const { data, error } = await (supabase as any)
    .from("preferences")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) return null;
  return ((data as { value: T } | null)?.value) ?? null;
}

export async function setPreference(key: string, value: unknown): Promise<void> {
  const supabase = createClient();
  const { error } = await (supabase as any)
    .from("preferences")
    .upsert({ key, value });
  if (error) throw new Error(`Errore salvataggio preferenza: ${error.message}`);
}

export async function getAllPreferences(): Promise<Record<string, unknown>> {
  const supabase = createClient();
  const { data, error } = await (supabase as any).from("preferences").select("*");
  if (error) throw new Error(`Errore lettura preferenze: ${error.message}`);
  const map: Record<string, unknown> = {};
  for (const row of (data as { key: string; value: unknown }[]) ?? []) {
    map[row.key] = row.value;
  }
  return map;
}
