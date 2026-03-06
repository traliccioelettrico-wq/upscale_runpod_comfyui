import { cn } from "@/lib/utils";

interface Props {
  value: number;
  status: "queued" | "processing" | "completed" | "error";
  showPercent?: boolean;
}

const FILL: Record<Props["status"], string> = {
  processing: "bg-gradient-to-r from-violet-500 to-indigo-400",
  completed:  "bg-gradient-to-r from-emerald-500 to-teal-400",
  error:      "bg-gradient-to-r from-red-500 to-red-400",
  queued:     "bg-zinc-600",
};

export function ProgressBar({ value, status, showPercent = true }: Props) {
  const fill = FILL[status];
  const isActive = status === "processing";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500 relative overflow-hidden", fill)}
          style={{ width: `${value}%` }}
        >
          {isActive && value > 0 && (
            <span className="animate-shimmer absolute inset-0" />
          )}
        </div>
      </div>
      {showPercent && (
        <span className="text-xs tabular-nums text-muted-foreground w-8 text-right font-mono">
          {value}%
        </span>
      )}
    </div>
  );
}
