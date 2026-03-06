"use client";
import Link from "next/link";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { JobStatusBadge } from "./JobStatusBadge";
import { ProgressBar } from "./ProgressBar";
import { Download, Trash2, ChevronRight } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { RESOLUTION_LABELS } from "@/lib/constants";
import { POLLING_DETAIL_MS } from "@/lib/constants";
import { deleteRemoteJob, getDownloadUrl } from "@/lib/api-client";
import { syncJobFromRemote, deleteJobLocal } from "@/lib/supabase/queries";
import type { RemoteJobDetail } from "@/lib/types";
import type { Database } from "@/lib/supabase/types";
import { toast } from "sonner";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

interface Props {
  job: JobRow;
  onDeleted: () => void;
}

async function fetchDetail(jobId: string): Promise<RemoteJobDetail> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) throw new Error("offline");
  return res.json();
}

export function JobCard({ job, onDeleted }: Props) {
  const isActive = job.status === "processing" || job.status === "queued";

  const { data: live } = useSWR<RemoteJobDetail>(
    isActive ? `job-${job.remote_job_id}` : null,
    () => fetchDetail(job.remote_job_id),
    {
      refreshInterval: POLLING_DETAIL_MS,
      revalidateOnFocus: false,
      onSuccess: async (d) => {
        await syncJobFromRemote(job.remote_job_id, {
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

  const status    = (live?.status    ?? job.status)    as JobRow["status"];
  const progress  = live?.progress  ?? job.progress;
  const elapsed   = live?.elapsed_seconds ?? job.elapsed_seconds;

  async function handleDelete() {
    try {
      if (status !== "processing") {
        await deleteRemoteJob(job.remote_job_id).catch(() => {});
      }
      await deleteJobLocal(job.remote_job_id);
      toast.success("Job eliminato");
      onDeleted();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const resLabel = RESOLUTION_LABELS[job.target_height as keyof typeof RESOLUTION_LABELS] ?? `${job.target_height}p`;

  return (
    <Card className="hover:border-muted-foreground/40 transition-colors">
      <CardContent className="py-4 px-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{job.video_filename}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Target: {resLabel} &middot; {job.interpolate ? `Interpolazione ×${job.fps_multiplier}` : "No interpolazione"}
            </p>
          </div>
          <JobStatusBadge status={status} />
        </div>

        {/* Progress */}
        <ProgressBar value={progress} status={status} />

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {elapsed > 0 ? formatDuration(elapsed) : "—"}
          </span>
          <div className="flex items-center gap-1">
            {status === "completed" && (
              <Button size="sm" variant="outline" asChild>
                <a href={getDownloadUrl(job.remote_job_id)} download>
                  <Download className="w-3.5 h-3.5 mr-1" /> Download
                </a>
              </Button>
            )}
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/jobs/${job.remote_job_id}`}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
            {status !== "processing" && (
              <Button size="sm" variant="ghost" onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
