import type {
  HealthResponse,
  RemoteJobDetail,
  RemoteJobSummary,
  UploadResponse,
  UpscaleParams,
} from "./types";

// Tutte le chiamate vanno alle API routes Next.js (proxy server-side)

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/pod/health");
}

export async function fetchHealthForUrl(url: string): Promise<HealthResponse> {
  return apiFetch<HealthResponse>(`/api/pod/health?url=${encodeURIComponent(url)}`);
}

export async function fetchJobs(): Promise<RemoteJobSummary[]> {
  return apiFetch<RemoteJobSummary[]>("/api/jobs");
}

export async function fetchJobDetail(jobId: string): Promise<RemoteJobDetail> {
  return apiFetch<RemoteJobDetail>(`/api/jobs/${jobId}`);
}

export async function deleteRemoteJob(jobId: string): Promise<void> {
  await apiFetch(`/api/jobs/${jobId}`, { method: "DELETE" });
}

export async function startUpscale(params: UpscaleParams): Promise<{ job_id: string }> {
  return apiFetch<{ job_id: string }>("/api/upscale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_filename: params.videoFilename,
      target_height: params.targetHeight,
      interpolate: params.interpolate,
      fps_multiplier: params.fpsMultiplier,
      output_filename: params.outputFilename ?? undefined,
    }),
  });
}

export async function uploadVideo(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Upload fallito: HTTP ${res.status}`);
  }
  return res.json() as Promise<UploadResponse>;
}

export function getDownloadUrl(jobId: string): string {
  return `/api/jobs/${jobId}/download`;
}
