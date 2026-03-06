"use client";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import { POLLING_HEALTH_MS } from "@/lib/constants";
import type { HealthResponse } from "@/lib/types";
import { useConnection } from "@/lib/connection-store";

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/pod/health");
  if (!res.ok) throw new Error("offline");
  return res.json();
}

interface DotProps {
  color: string;
  pulse?: boolean;
}

function StatusDot({ color, pulse }: DotProps) {
  return (
    <span className="relative flex h-2 w-2">
      {pulse && (
        <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-60", color)} />
      )}
      <span className={cn("relative inline-flex rounded-full h-2 w-2", color)} />
    </span>
  );
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
        <StatusDot color="bg-zinc-500" />
        Non configurato
      </span>
    );
  }

  if (error) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <StatusDot color="bg-destructive" />
        Offline
      </span>
    );
  }

  if (!data) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <StatusDot color="bg-muted-foreground/50" pulse />
        Verifica...
      </span>
    );
  }

  const ok = data.comfyui === "reachable";
  return (
    <span className={cn("flex items-center gap-1.5 text-xs", ok ? "text-emerald-400" : "text-amber-400")}>
      <StatusDot color={ok ? "bg-emerald-400" : "bg-amber-400"} pulse={ok} />
      {ok ? `Online · ${data.active_jobs} job` : "ComfyUI offline"}
    </span>
  );
}
