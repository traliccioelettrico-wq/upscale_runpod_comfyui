import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface Props {
  value: number;        // 0–100
  status: "queued" | "processing" | "completed" | "error";
  showPercent?: boolean;
}

export function ProgressBar({ value, status, showPercent = true }: Props) {
  const color =
    status === "completed" ? "bg-emerald-500" :
    status === "error"     ? "bg-red-500" :
    status === "processing" ? "bg-blue-500" :
    "bg-zinc-600";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", color)}
          style={{ width: `${value}%` }}
        />
      </div>
      {showPercent && (
        <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
          {value}%
        </span>
      )}
    </div>
  );
}
