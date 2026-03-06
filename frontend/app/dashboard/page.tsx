"use client";
import Link from "next/link";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { JobCard } from "@/components/jobs/JobCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, ListVideo, CheckCircle2, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { getJobHistory } from "@/lib/supabase/queries";
import { POLLING_JOBS_MS } from "@/lib/constants";
import type { Database } from "@/lib/supabase/types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

async function fetchJobs(): Promise<JobRow[]> {
  return getJobHistory(50);
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

function StatCard({ label, value, icon: Icon, iconBg, iconColor }: StatCardProps) {
  return (
    <Card className="group">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${iconBg}`}>
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground leading-none mt-0.5">{label}</p>
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
  const queued     = (jobs ?? []).filter((j) => j.status === "queued").length;
  const completed  = (jobs ?? []).filter((j) => j.status === "completed").length;
  const errors     = (jobs ?? []).filter((j) => j.status === "error").length;

  const activeJobs = (jobs ?? []).filter(
    (j) => j.status === "processing" || j.status === "queued"
  );
  const recentJobs = (jobs ?? []).slice(0, 5);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Panoramica</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Monitora i tuoi job di upscaling</p>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/upscale">
            <Zap className="w-3.5 h-3.5" /> Nuovo upscaling
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="In elaborazione"
          value={processing}
          icon={Loader2}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-400"
        />
        <StatCard
          label="In coda"
          value={queued}
          icon={ListVideo}
          iconBg="bg-zinc-500/10"
          iconColor="text-zinc-400"
        />
        <StatCard
          label="Completati"
          value={completed}
          icon={CheckCircle2}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-400"
        />
        <StatCard
          label="Errori"
          value={errors}
          icon={AlertCircle}
          iconBg="bg-red-500/10"
          iconColor="text-red-400"
        />
      </div>

      {/* Active jobs */}
      {activeJobs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              In esecuzione
            </h2>
          </div>
          {activeJobs.map((job) => (
            <JobCard key={job.id} job={job} onDeleted={() => mutate()} />
          ))}
        </section>
      )}

      {/* Recent jobs */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Job recenti
          </h2>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground" asChild>
            <Link href="/jobs">
              Vedi tutti <ArrowRight className="w-3 h-3" />
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : recentJobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center">
                <ListVideo className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Nessun job ancora</p>
                <p className="text-xs text-muted-foreground">
                  <Link href="/upscale" className="text-primary underline-offset-4 hover:underline">
                    Avvia il tuo primo upscale
                  </Link>{" "}
                  per iniziare.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          recentJobs.map((job) => (
            <JobCard key={job.id} job={job} onDeleted={() => mutate()} />
          ))
        )}
      </section>
    </div>
  );
}
