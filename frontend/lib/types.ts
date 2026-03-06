// Tipi applicativi condivisi.
// I tipi delle tabelle Supabase sono auto-generati in lib/supabase/types.ts

// ─── RunPod ───────────────────────────────────────────────────────────────────

export interface PodInfo {
  id: string;
  name: string;
  gpu: string;
  status: string;
  proxyUrl: string;
  upscalerHealthy: boolean;
}

// ─── API server remoto ────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  comfyui: "reachable" | "unreachable";
  comfyui_url: string;
  queue_size: number;
  active_jobs: number;
  max_concurrent_jobs: number;
}

export interface RemoteJobSummary {
  job_id: string;
  status: "queued" | "processing" | "completed" | "error";
  progress: number;
  elapsed_seconds: number;
  output_filename: string | null;
}

export interface RemoteJobDetail extends RemoteJobSummary {
  current_node: string | null;
  message: string | null;
}

export interface UploadResponse {
  filename: string;
}

// ─── Video ────────────────────────────────────────────────────────────────────

export interface VideoMetadata {
  filename: string;
  width: number;
  height: number;
  fps: number | null;         // Not available via native HTMLVideoElement
  duration: number | null;
  totalFrames: number | null; // Not available via native HTMLVideoElement
  codec: string | null;       // Not available via native HTMLVideoElement
  orientation: "landscape" | "portrait" | "square";
  aspectRatio: string;
  fileSize: number;
}

// ─── Parametri upscale ───────────────────────────────────────────────────────

export type TargetResolution = 720 | 1080 | 1440 | 2160;
export type FpsMultiplier = 2 | 3 | 4;

export interface UpscaleParams {
  videoFilename: string;
  targetHeight: TargetResolution;
  interpolate: boolean;
  fpsMultiplier: FpsMultiplier;
  outputFilename?: string;
}

// ─── Tipo composto job (Supabase + live) ─────────────────────────────────────

export interface JobView {
  id: string;
  remoteJobId: string;
  videoFilename: string;
  targetHeight: TargetResolution;
  interpolate: boolean;
  fpsMultiplier: FpsMultiplier;
  sourceWidth: number | null;
  sourceHeight: number | null;
  sourceFps: number | null;
  sourceDuration: number | null;
  createdAt: string;
  status: "queued" | "processing" | "completed" | "error";
  progress: number;
  currentNode: string | null;
  elapsedSeconds: number;
  message: string | null;
  outputFilename: string | null;
  outputRemoteFilename: string | null;
  completedAt: string | null;
  connectionName: string;
  podUrl: string;
}
