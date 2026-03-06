import type { PodInfo } from "./types";

export async function discoverPods(runpodApiKey: string): Promise<PodInfo[]> {
  const res = await fetch("/api/pods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runpod_api_key: runpodApiKey }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Errore discovery pod: HTTP ${res.status}`);
  }
  return res.json() as Promise<PodInfo[]>;
}
