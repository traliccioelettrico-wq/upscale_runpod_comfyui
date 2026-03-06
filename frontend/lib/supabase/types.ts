// Auto-generato da: npx supabase gen types typescript --local > lib/supabase/types.ts
// Rigenera dopo ogni modifica allo schema.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      connections: {
        Row: {
          id: string;
          name: string;
          mode: "auto" | "manual";
          pod_url: string;
          api_token: string;
          runpod_api_key: string | null;
          pod_id: string | null;
          is_active: boolean;
          last_health: Json | null;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          mode: "auto" | "manual";
          pod_url: string;
          api_token: string;
          runpod_api_key?: string | null;
          pod_id?: string | null;
          is_active?: boolean;
          last_health?: Json | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["connections"]["Insert"]>;
      };
      jobs: {
        Row: {
          id: string;
          remote_job_id: string;
          connection_id: string;
          status: "queued" | "processing" | "completed" | "error";
          progress: number;
          current_node: string | null;
          elapsed_seconds: number;
          message: string | null;
          video_filename: string;
          target_height: number;
          interpolate: boolean;
          fps_multiplier: number;
          output_filename: string | null;
          source_width: number | null;
          source_height: number | null;
          source_fps: number | null;
          source_duration: number | null;
          source_total_frames: number | null;
          source_codec: string | null;
          source_file_size: number | null;
          output_remote_filename: string | null;
          output_downloaded_path: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          remote_job_id: string;
          connection_id: string;
          status?: "queued" | "processing" | "completed" | "error";
          progress?: number;
          current_node?: string | null;
          elapsed_seconds?: number;
          message?: string | null;
          video_filename: string;
          target_height: number;
          interpolate?: boolean;
          fps_multiplier?: number;
          output_filename?: string | null;
          source_width?: number | null;
          source_height?: number | null;
          source_fps?: number | null;
          source_duration?: number | null;
          source_total_frames?: number | null;
          source_codec?: number | null;
          source_file_size?: number | null;
          output_remote_filename?: string | null;
          output_downloaded_path?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Insert"]>;
      };
      preferences: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["preferences"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
