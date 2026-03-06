import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FPS_MULTIPLIERS } from "@/lib/constants";
import type { FpsMultiplier } from "@/lib/types";

interface Props {
  enabled: boolean;
  multiplier: FpsMultiplier;
  sourceFps: number | null;
  onEnabledChange: (v: boolean) => void;
  onMultiplierChange: (v: FpsMultiplier) => void;
  disabled?: boolean;
}

export function InterpolationConfig({
  enabled,
  multiplier,
  sourceFps,
  onEnabledChange,
  onMultiplierChange,
  disabled,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="interpolation-switch">Interpolazione frame (RIFE)</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aumenta il frame rate moltiplicando i fotogrammi
          </p>
        </div>
        <Switch
          id="interpolation-switch"
          checked={enabled}
          onCheckedChange={onEnabledChange}
          disabled={disabled}
        />
      </div>

      {enabled && (
        <div className="space-y-2 pl-2 border-l-2 border-primary/30">
          <Label className="text-xs text-muted-foreground">Moltiplicatore</Label>
          <RadioGroup
            value={String(multiplier)}
            onValueChange={(v) => onMultiplierChange(Number(v) as FpsMultiplier)}
            disabled={disabled}
            className="flex gap-3"
          >
            {FPS_MULTIPLIERS.map(({ value: m, label }) => {
              const outputFps = sourceFps != null ? (sourceFps * m).toFixed(2) : null;
              return (
                <label
                  key={m}
                  className={[
                    "flex flex-col items-center gap-0.5 rounded-lg border px-4 py-2 cursor-pointer transition-colors",
                    multiplier === m
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-muted-foreground/50",
                    disabled ? "opacity-50 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  <RadioGroupItem value={String(m)} className="sr-only" />
                  <span className="text-sm font-semibold">{label}</span>
                  {outputFps && (
                    <span className="text-xs text-muted-foreground">{outputFps} fps</span>
                  )}
                </label>
              );
            })}
          </RadioGroup>
        </div>
      )}
    </div>
  );
}
