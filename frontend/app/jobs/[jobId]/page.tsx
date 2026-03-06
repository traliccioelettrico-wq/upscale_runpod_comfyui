"use client";
import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { ProgressBar } from "@/components/jobs/ProgressBar";
import { ArrowLeft, Download, Trash2, Loader2 } from "lucide-react";
import { formatDuration, formatTimecode, formatFileSize } from "@/lib/utils";
import { RESOLUTION_LABELS, POLLING_DETAIL_MS } from "@/lib/constants";
import { getDownloadUrl, deleteRemoteJob } from "@/lib/api-client";
import { getJobByRemoteId, syncJobFromRemote, deleteJobLocal } from "@/lib/supabase/queries";
import type { RemoteJobDetail } from "@/lib/types";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function fetchDetail(jobId: string): Promise<RemoteJobDetail> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) throw new Error("offline");
  return res.json();
}

export default function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const { data: local } = useSWR(
    `local-job-${jobId}`,
    () => getJobByRemoteId(jobId),
    { refreshInterval: 5000 }
  );

  const isActive = local?.status === "processing" || local?.status === "queued";

  const { data: live } = useSWR<RemoteJobDetail>(
    isActive ? `detail-${jobId}` : null,
    () => fetchDetail(jobId),
    {
      refreshInterval: POLLING_DETAIL_MS,
      revalidateOnFocus: false,
      onSuccess: async (d) => {
        await syncJobFromRemote(jobId, {
          status: d.status,
          progress: d.progress,
          current_node: d.current_node,
          elapsed_seconds: d.elapsed_seconds,
          message: d.message,
          ...(d.status === "completed" && {
            output_remote_filename: d.output_filename,
            completed_at: new Date().toISOString(),
          }),
        });
      },
    }
  );

  const status   = (live?.status   ?? local?.status   ?? "queued") as RemoteJobDetail["status"];
  const progress = live?.progress  ?? local?.progress  ?? 0;
  const elapsed  = live?.elapsed_seconds ?? local?.elapsed_seconds ?? 0;
  const node     = live?.current_node ?? local?.current_node;

  async function handleDelete() {
    setDeleting(true);
    try {
      if (status !== "processing") await deleteRemoteJob(jobId).catch(() => {});
      await deleteJobLocal(jobId);
      toast.success("Job eliminato");
      router.push("/jobs");
    } catch (e: any) {
      toast.error(e.message);
      setDeleting(false);
    }
  }

  if (!local) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const resLabel = RESOLUTION_LABELS[local.target_height as keyof typeof RESOLUTION_LABELS] ?? `${local.target_height}p`;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/jobs"><ArrowLeft className="w-4 h-4 mr-1" /> Torna alla lista</Link>
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold truncate">{local.video_filename}</h1>
        <JobStatusBadge status={status} />
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <ProgressBar value={progress} status={status} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{node ? `Nodo: ${node}` : " "}</span>
            <span>{elapsed > 0 ? formatDuration(elapsed) : "—"}</span>
          </div>
          {status === "error" && local.message && (
            <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{local.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Parametri */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Parametri</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1.5">
          <Row label="Video" value={local.video_filename} />
          <Row label="Risoluzione target" value={resLabel} />
          <Row
            label="Interpolazione"
            value={local.interpolate ? `ON ×${local.fps_multiplier}` : "OFF"}
          />
          {local.source_width && local.source_height && (
            <Row label="Risoluzione sorgente" value={`${local.source_width}×${local.source_height}`} />
          )}
          {local.source_fps && (
            <Row label="FPS sorgente" value={`${local.source_fps.toFixed(2)} fps`} />
          )}
          {local.source_duration && (
            <Row label="Durata" value={formatTimecode(local.source_duration)} />
          )}
          {local.source_file_size && (
            <Row label="Dimensione file" value={formatFileSize(local.source_file_size)} />
          )}
        </CardContent>
      </Card>

      {/* Output */}
      {status === "completed" && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Output</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {local.output_remote_filename && (
              <p className="text-sm text-muted-foreground">{local.output_remote_filename}</p>
            )}
            <Button asChild>
              <a href={getDownloadUrl(jobId)} download>
                <Download className="w-4 h-4 mr-2" /> Scarica video
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        disabled={deleting || status === "processing"}
      >
        {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
        Elimina job
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
