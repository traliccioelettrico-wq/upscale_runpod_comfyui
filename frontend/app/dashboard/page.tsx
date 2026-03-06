"use client";
import Link from "next/link";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobCard } from "@/components/jobs/JobCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, ListVideo, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { getJobHistory } from "@/lib/supabase/queries";
import { POLLING_JOBS_MS } from "@/lib/constants";
import type { Database } from "@/lib/supabase/types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

async function fetchJobs(): Promise<JobRow[]> {
  return getJobHistory(50);
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: jobs, isLoading, mutate } = useSWR<JobRow[]>(
    "jobs-history",
    fetchJobs,
    { refreshInterval: POLLING_JOBS_MS, revalidateOnFocus: true }
  );

  const processing = (jobs ?? []).filter((j) => j.status === "processing").length;
  const queued = (jobs ?? []).filter((j) => j.status === "queued").length;
  const completed = (jobs ?? []).filter((j) => j.status === "completed").length;
  const errors = (jobs ?? []).filter((j) => j.status === "error").length;

  const activeJobs = (jobs ?? []).filter(
    (j) => j.status === "processing" || j.status === "queued"
  );
  const recentJobs = (jobs ?? []).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Button asChild>
          <Link href="/upscale">
            <Zap className="w-4 h-4 mr-2" /> Nuovo upscaling
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="In elaborazione"
          value={processing}
          icon={Loader2}
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          label="In coda"
          value={queued}
          icon={ListVideo}
          color="bg-zinc-500/10 text-zinc-400"
        />
        <StatCard
          label="Completati"
          value={completed}
          icon={CheckCircle2}
          color="bg-emerald-500/10 text-emerald-400"
        />
        <StatCard
          label="Errori"
          value={errors}
          icon={AlertCircle}
          color="bg-red-500/10 text-red-400"
        />
      </div>

      {/* Active jobs */}
      {activeJobs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            In esecuzione
          </h2>
          {activeJobs.map((job) => (
            <JobCard key={job.id} job={job} onDeleted={() => mutate()} />
          ))}
        </div>
      )}

      {/* Recent jobs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Job recenti
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/jobs">Vedi tutti</Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
          </div>
        ) : recentJobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
              <ListVideo className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Nessun job trovato.{" "}
                <Link href="/upscale" className="text-primary underline-offset-4 hover:underline">
                  Avvia il tuo primo upscale!
                </Link>
              </p>
            </CardContent>
          </Card>
        ) : (
          recentJobs.map((job) => (
            <JobCard key={job.id} job={job} onDeleted={() => mutate()} />
          ))
        )}
      </div>
    </div>
  );
}
