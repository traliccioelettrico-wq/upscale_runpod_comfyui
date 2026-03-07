"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ProgressBar } from "@/components/jobs/ProgressBar";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { ImageDropzone, type ImageInput } from "./ImageDropzone";
import {
  startImageUpscale,
  getImageJobStatus,
  fetchImageAsBlob,
  downloadImage,
  fileToBase64,
} from "@/lib/image-api";
import { POLLING_DETAIL_MS } from "@/lib/constants";
import { formatDuration, cn } from "@/lib/utils";
import type { ImageTargetResolution, ImageScaleMode, RemoteJobDetail } from "@/lib/types";
import { Zap, Loader2, Download, RotateCcw, ArrowRight, ImageIcon } from "lucide-react";

const RESOLUTIONS: { value: ImageTargetResolution; label: string; description: string }[] = [
  { value: 720,  label: "720p",  description: "HD" },
  { value: 1080, label: "1080p", description: "Full HD" },
  { value: 1440, label: "1440p", description: "2K" },
  { value: 2160, label: "2160p", description: "4K" },
  { value: 4320, label: "4320p", description: "8K" },
];

type JobStatusType = "queued" | "processing" | "completed" | "error";

interface ActiveJob {
  jobId: string;
  status: JobStatusType;
  progress: number;
  currentNode: string | null;
  elapsedSeconds: number;
  message: string | null;
  outputFilename: string | null;
}

export function ImageUpscaleForm() {
  const [imageInput,   setImageInput]   = useState<ImageInput | null>(null);
  const [resolution,   setResolution]   = useState<ImageTargetResolution>(2160);
  const [scaleMode,    setScaleMode]    = useState<ImageScaleMode>("target");
  const [submitting,   setSubmitting]   = useState(false);
  const [job,          setJob]          = useState<ActiveJob | null>(null);
  const [resultBlob,   setResultBlob]   = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      if (resultBlob) URL.revokeObjectURL(resultBlob);
    };
  }, [stopPolling, resultBlob]);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const detail: RemoteJobDetail = await getImageJobStatus(jobId);
        const status = detail.status as JobStatusType;

        setJob((prev) => prev ? {
          ...prev,
          status,
          progress:       detail.progress,
          currentNode:    detail.current_node,
          elapsedSeconds: detail.elapsed_seconds,
          message:        detail.message,
          outputFilename: detail.output_filename,
        } : null);

        if (status === "completed") {
          stopPolling();
          // Carica risultato come blob per sicurezza (nessun token in query string)
          try {
            const blobUrl = await fetchImageAsBlob(jobId);
            setResultBlob(blobUrl);
          } catch {
            toast.error("Immagine completata ma download fallito");
          }
        } else if (status === "error") {
          stopPolling();
          toast.error(detail.message ?? "Errore durante l'elaborazione");
        }
      } catch {
        // rete intermittente — continua polling
      }
    }, POLLING_DETAIL_MS);
  }, [stopPolling]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageInput || submitting) return;

    setSubmitting(true);
    setResultBlob(null);

    try {
      let imageBase64: string | undefined;
      let imageUrl: string | undefined;

      if (imageInput.mode === "file" && imageInput.file) {
        imageBase64 = await fileToBase64(imageInput.file);
      } else {
        imageUrl = imageInput.url;
      }

      const result = await startImageUpscale({
        imageBase64,
        imageUrl,
        targetHeight: resolution,
        scaleMode,
      });

      const newJob: ActiveJob = {
        jobId:          result.job_id,
        status:         "queued",
        progress:       0,
        currentNode:    null,
        elapsedSeconds: 0,
        message:        null,
        outputFilename: null,
      };
      setJob(newJob);
      toast.success("Job avviato!");
      startPolling(result.job_id);

    } catch (err: any) {
      toast.error(err.message ?? "Errore avvio job");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    stopPolling();
    setImageInput(null);
    setJob(null);
    if (resultBlob) {
      URL.revokeObjectURL(resultBlob);
      setResultBlob(null);
    }
  }

  /* ── Calcolo dimensioni output ── */
  const outputDims = imageInput && scaleMode === "target"
    ? (() => {
        const scale = resolution / (imageInput.height * 4);
        const clampedScale = Math.min(scale, 1.0);
        return {
          w: Math.round(imageInput.width * 4 * clampedScale),
          h: Math.round(imageInput.height * 4 * clampedScale),
        };
      })()
    : imageInput
    ? { w: imageInput.width * 4, h: imageInput.height * 4 }
    : null;

  const canSubmit = !!imageInput && !submitting && !job;

  /* ── Risultato completato ── */
  if (job?.status === "completed" && resultBlob) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-500/20 overflow-hidden bg-emerald-500/5">
          <div className="bg-muted/30 flex items-center justify-center min-h-48 max-h-80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resultBlob}
              alt="Immagine upscalata"
              className="max-h-80 max-w-full object-contain"
            />
          </div>
          <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-emerald-400">Completato</p>
              {outputDims && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {imageInput?.width}×{imageInput?.height} px
                  {" "}<ArrowRight className="w-3 h-3 inline" />{" "}
                  {outputDims.w}×{outputDims.h} px
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() => downloadImage(job.jobId, job.outputFilename ?? `upscaled_${job.jobId}.png`)}
              >
                <Download className="w-3.5 h-3.5" /> Scarica PNG
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-xs"
                onClick={handleReset}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Nuovo
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Job in corso ── */
  if (job && job.status !== "completed") {
    return (
      <div className="space-y-4">
        <Card className={cn(
          "border transition-all",
          job.status === "error" ? "border-red-500/20" : "border-primary/20"
        )}>
          <CardContent className="pt-5 pb-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center flex-shrink-0">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {imageInput?.mode === "file" ? imageInput.file!.name : imageInput?.url ?? "Immagine"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Target: {resolution}p · {scaleMode === "target" ? "Target height" : "Native 4x"}
                  </p>
                </div>
              </div>
              <JobStatusBadge status={job.status} />
            </div>

            <ProgressBar value={job.progress} status={job.status} />

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono">{formatDuration(job.elapsedSeconds)}</span>
              {job.currentNode && (
                <span className="truncate ml-4 max-w-48">Nodo: {job.currentNode}</span>
              )}
            </div>

            {job.status === "error" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5 text-muted-foreground"
                onClick={handleReset}
              >
                <RotateCcw className="w-3 h-3" /> Riprova
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ── Form principale ── */
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Dropzone immagine */}
      <ImageDropzone
        value={imageInput}
        onSelected={setImageInput}
        onCleared={() => setImageInput(null)}
        disabled={submitting}
      />

      {/* Parametri */}
      <Card>
        <CardContent className="pt-5 space-y-5">
          {/* Risoluzione target */}
          <div className="space-y-2">
            <Label>Risoluzione target</Label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {RESOLUTIONS.map(({ value, label, description }) => {
                const isActive = resolution === value;
                return (
                  <label
                    key={value}
                    className={cn(
                      "flex flex-col items-center justify-center gap-0.5 rounded-lg border p-3 cursor-pointer transition-colors",
                      isActive
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-muted-foreground/50",
                      submitting && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <input
                      type="radio"
                      name="resolution"
                      value={value}
                      checked={isActive}
                      onChange={() => setResolution(value)}
                      disabled={submitting}
                      className="sr-only"
                    />
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-xs text-muted-foreground">{description}</span>
                    {outputDims && isActive && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {outputDims.w}×{outputDims.h}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Scale mode */}
          <div className="space-y-2">
            <Label>Modalità scala</Label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "target" as const, label: "Target Height", description: "Scala al target selezionato" },
                { value: "native" as const, label: "Native 4x",     description: "Output nativo ESRGAN (4×)" },
              ] as const).map(({ value, label, description }) => (
                <label
                  key={value}
                  className={cn(
                    "flex flex-col gap-0.5 p-3 rounded-lg border cursor-pointer transition-colors",
                    scaleMode === value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-muted-foreground/50",
                    submitting && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <input
                    type="radio"
                    name="scaleMode"
                    value={value}
                    checked={scaleMode === value}
                    onChange={() => setScaleMode(value)}
                    disabled={submitting}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">{description}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <Button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-primary hover:bg-primary/90 shadow-[0_2px_12px_oklch(0.64_0.20_292/0.35)] hover:shadow-[0_4px_16px_oklch(0.64_0.20_292/0.45)] transition-shadow"
        size="lg"
      >
        {submitting ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Avvio in corso...</>
        ) : (
          <><Zap className="w-4 h-4 mr-2" /> Avvia upscaling</>
        )}
      </Button>
    </form>
  );
}
