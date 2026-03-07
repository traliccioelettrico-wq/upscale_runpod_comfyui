import type { ImageUpscaleParams, ImageJobStartResult, RemoteJobDetail } from "./types";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Converte un File in stringa base64 (senza data URL prefix). */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Avvia un job di upscale immagine. */
export async function startImageUpscale(params: ImageUpscaleParams): Promise<ImageJobStartResult> {
  return apiFetch<ImageJobStartResult>("/api/upscale/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64:    params.imageBase64,
      image_url:       params.imageUrl,
      target_height:   params.targetHeight,
      scale_mode:      params.scaleMode,
      output_filename: params.outputFilename ?? undefined,
    }),
  });
}

/** Polling status di un job (video o immagine). */
export async function getImageJobStatus(jobId: string): Promise<RemoteJobDetail> {
  return apiFetch<RemoteJobDetail>(`/api/jobs/${jobId}`);
}

/** URL Next.js proxy per scaricare l'immagine risultante. */
export function getImageDownloadUrl(jobId: string): string {
  return `/api/jobs/${jobId}/download-image`;
}

/**
 * Scarica l'immagine risultante come Blob URL locale.
 * Usare questo per il tag <img> in modo da non esporre il token.
 */
export async function fetchImageAsBlob(jobId: string): Promise<string> {
  const res = await fetch(getImageDownloadUrl(jobId));
  if (!res.ok) throw new Error(`Download fallito: HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Scarica l'immagine e forza il download nel browser. */
export async function downloadImage(jobId: string, filename: string): Promise<void> {
  const blobUrl = await fetchImageAsBlob(jobId);
  const a = document.createElement("a");
  a.href     = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}
