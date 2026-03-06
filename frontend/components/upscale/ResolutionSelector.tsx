import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RESOLUTIONS } from "@/lib/constants";
import { calcOutputDimensions } from "@/lib/utils";
import type { TargetResolution, VideoMetadata } from "@/lib/types";

interface Props {
  value: TargetResolution;
  onChange: (v: TargetResolution) => void;
  metadata: VideoMetadata | null;
  disabled?: boolean;
}

export function ResolutionSelector({ value, onChange, metadata, disabled }: Props) {
  return (
    <div className="space-y-2">
      <Label>Risoluzione target</Label>
      <RadioGroup
        value={String(value)}
        onValueChange={(v) => onChange(Number(v) as TargetResolution)}
        disabled={disabled}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {RESOLUTIONS.map(({ value: res, label, description }) => {
          const dims = metadata?.width && metadata?.height
            ? calcOutputDimensions(metadata.width, metadata.height, res)
            : null;

          return (
            <label
              key={res}
              className={[
                "flex flex-col items-center justify-center gap-0.5 rounded-lg border p-3 cursor-pointer transition-colors",
                value === res
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-muted-foreground/50",
                disabled ? "opacity-50 cursor-not-allowed" : "",
              ].join(" ")}
            >
              <RadioGroupItem value={String(res)} className="sr-only" />
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs text-muted-foreground">{description}</span>
              {dims && (
                <span className="text-xs text-muted-foreground">
                  {dims.width}×{dims.height}
                </span>
              )}
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}
