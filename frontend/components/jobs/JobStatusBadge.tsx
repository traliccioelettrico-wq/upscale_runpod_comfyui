import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status = "queued" | "processing" | "completed" | "error";

const LABELS: Record<Status, string> = {
  queued:     "In coda",
  processing: "In elaborazione",
  completed:  "Completato",
  error:      "Errore",
};

const CLASSES: Record<Status, string> = {
  queued:     "bg-zinc-700 text-zinc-300",
  processing: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  completed:  "bg-emerald-600/20 text-emerald-400 border-emerald-600/30",
  error:      "bg-red-600/20 text-red-400 border-red-600/30",
};

export function JobStatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
        CLASSES[status]
      )}
    >
      {LABELS[status]}
    </span>
  );
}
