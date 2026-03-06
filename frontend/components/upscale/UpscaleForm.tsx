"use client";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Zap } from "lucide-react";
import { VideoDropzone } from "./VideoDropzone";
import { VideoMetadataCard } from "./VideoMetadataCard";
import { ResolutionSelector } from "./ResolutionSelector";
import { InterpolationConfig } from "./InterpolationConfig";
import { uploadVideo, startUpscale } from "@/lib/api-client";
import { upsertJob, getAllPreferences } from "@/lib/supabase/queries";
import type { VideoMetadata, TargetResolution, FpsMultiplier } from "@/lib/types";

export function UpscaleForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [resolution, setResolution] = useState<TargetResolution>(1080);
  const [interpolate, setInterpolate] = useState(false);
  const [fpsMultiplier, setFpsMultiplier] = useState<FpsMultiplier>(2);
  const [submitting, setSubmitting] = useState(false);

  // Load defaults from preferences
  useEffect(() => {
    getAllPreferences().then((prefs) => {
      if (prefs.target_height) setResolution(prefs.target_height as TargetResolution);
      if (prefs.interpolate !== undefined) setInterpolate(Boolean(prefs.interpolate));
      if (prefs.fps_multiplier) setFpsMultiplier(Number(prefs.fps_multiplier) as FpsMultiplier);
    }).catch(() => {});
  }, []);

  const handleFileSelected = useCallback((f: File, m: VideoMetadata) => {
    setFile(f);
    setMetadata(m);
  }, []);

  const handleFileCleared = useCallback(() => {
    setFile(null);
    setMetadata(null);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setSubmitting(true);
    try {
      // 1. Upload video to pod
      const uploadResult = await uploadVideo(file);

      // 2. Start upscale job
      const jobResult = await startUpscale({
        videoFilename: uploadResult.filename,
        targetHeight: resolution,
        interpolate,
        fpsMultiplier: interpolate ? fpsMultiplier : fpsMultiplier,
      });

      // 3. Save job to local DB (connection_id is resolved inside upsertJob)
      await upsertJob({
        remote_job_id: jobResult.job_id,
        video_filename: file.name,
        target_height: resolution,
        interpolate,
        fps_multiplier: fpsMultiplier,
        status: "queued",
        progress: 0,
        source_width: metadata?.width ?? null,
        source_height: metadata?.height ?? null,
        source_fps: metadata?.fps ?? null,
        source_duration: metadata?.duration ?? null,
        source_file_size: file.size,
      });

      toast.success("Job avviato con successo!");
      router.push(`/jobs/${jobResult.job_id}`);
    } catch (err: any) {
      toast.error(err.message ?? "Errore durante l'avvio del job");
      setSubmitting(false);
    }
  }

  const canSubmit = !!file && !submitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Drop zone */}
      <VideoDropzone
        selectedFile={file}
        onFileSelected={handleFileSelected}
        onFileCleared={handleFileCleared}
        disabled={submitting}
      />

      {/* Metadata */}
      {metadata && file && (
        <VideoMetadataCard metadata={metadata} fileSize={file.size} />
      )}

      {/* Settings */}
      <Card>
        <CardContent className="pt-5 space-y-5">
          <ResolutionSelector
            value={resolution}
            onChange={setResolution}
            metadata={metadata}
            disabled={submitting}
          />
          <InterpolationConfig
            enabled={interpolate}
            multiplier={fpsMultiplier}
            sourceFps={metadata?.fps ?? null}
            onEnabledChange={setInterpolate}
            onMultiplierChange={setFpsMultiplier}
            disabled={submitting}
          />
        </CardContent>
      </Card>

      <Button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-primary hover:bg-primary/90 shadow-[0_2px_12px_oklch(0.64_0.20_292/0.35)] hover:shadow-[0_4px_16px_oklch(0.64_0.20_292/0.45)] transition-shadow"
        size="lg"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Avvio in corso...
          </>
        ) : (
          <>
            <Zap className="w-4 h-4 mr-2" /> Avvia upscaling
          </>
        )}
      </Button>
    </form>
  );
}
