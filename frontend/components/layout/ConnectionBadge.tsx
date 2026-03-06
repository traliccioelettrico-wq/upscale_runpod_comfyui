"use client";
import useSWR from "swr";
import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { POLLING_HEALTH_MS } from "@/lib/constants";
import type { HealthResponse } from "@/lib/types";
import { useConnection } from "@/lib/connection-store";

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/pod/health");
  if (!res.ok) throw new Error("offline");
  return res.json();
}

export function ConnectionBadge() {
  const { connection } = useConnection();

  const { data, error } = useSWR<HealthResponse>(
    connection ? "pod-health" : null,
    fetchHealth,
    { refreshInterval: POLLING_HEALTH_MS, revalidateOnFocus: false }
  );

  if (!connection) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Circle className="w-2.5 h-2.5 fill-muted-foreground text-muted-foreground" />
        Non configurato
      </span>
    );
  }

  if (error) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <Circle className="w-2.5 h-2.5 fill-destructive text-destructive" />
        Offline
      </span>
    );
  }

  if (!data) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Circle className="w-2.5 h-2.5 fill-muted-foreground animate-pulse" />
        Verifica...
      </span>
    );
  }

  const ok = data.comfyui === "reachable";
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs",
        ok ? "text-emerald-400" : "text-amber-400"
      )}
    >
      <Circle
        className={cn(
          "w-2.5 h-2.5",
          ok ? "fill-emerald-400 text-emerald-400" : "fill-amber-400 text-amber-400"
        )}
      />
      {ok ? `Online · ${data.active_jobs} job attivi` : "ComfyUI offline"}
    </span>
  );
}
