import { cn } from "@/lib/utils";

type Status = "queued" | "processing" | "completed" | "error";

const CONFIG: Record<Status, { label: string; dot: string; badge: string }> = {
  queued:     { label: "In coda",         dot: "bg-zinc-400",                    badge: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25" },
  processing: { label: "In elaborazione", dot: "bg-blue-400 animate-pulse",      badge: "bg-blue-500/10 text-blue-400 border-blue-500/25" },
  completed:  { label: "Completato",      dot: "bg-emerald-400",                 badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" },
  error:      { label: "Errore",          dot: "bg-red-400",                     badge: "bg-red-500/10 text-red-400 border-red-500/25" },
};

export function JobStatusBadge({ status }: { status: Status }) {
  const { label, dot, badge } = CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border flex-shrink-0",
        badge
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", dot)} />
      {label}
    </span>
  );
}
