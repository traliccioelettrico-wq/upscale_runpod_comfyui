import type { TargetResolution, FpsMultiplier } from "./types";

export const RESOLUTIONS: { value: TargetResolution; label: string; description: string }[] = [
  { value: 720,  label: "720p",  description: "HD" },
  { value: 1080, label: "1080p", description: "Full HD" },
  { value: 1440, label: "1440p", description: "2K" },
  { value: 2160, label: "2160p", description: "4K" },
];

export const FPS_MULTIPLIERS: { value: FpsMultiplier; label: string }[] = [
  { value: 2, label: "×2" },
  { value: 3, label: "×3" },
  { value: 4, label: "×4" },
];

export const RESOLUTION_LABELS: Record<TargetResolution, string> = {
  720:  "HD",
  1080: "Full HD",
  1440: "2K",
  2160: "4K",
};

export const POLLING_HEALTH_MS = 10000;
export const POLLING_JOBS_MS   = 3000;
export const POLLING_DETAIL_MS = 2000;
