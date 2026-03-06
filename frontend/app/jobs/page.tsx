"use client";
import { useState, useCallback } from "react";
import useSWR from "swr";
import { JobCard } from "@/components/jobs/JobCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, ListVideo } from "lucide-react";
import { getJobHistory } from "@/lib/supabase/queries";
import type { Database } from "@/lib/supabase/types";
import { POLLING_JOBS_MS } from "@/lib/constants";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type FilterTab = "all" | "queued" | "processing" | "completed" | "error";

async function fetchJobs(): Promise<JobRow[]> {
  return getJobHistory(100);
}

export default function JobsPage() {
  const [filter, setFilter] = useState<FilterTab>("all");

  const { data: jobs, isLoading, mutate } = useSWR<JobRow[]>(
    "jobs-history",
    fetchJobs,
    { refreshInterval: POLLING_JOBS_MS, revalidateOnFocus: true }
  );

  const filtered = (jobs ?? []).filter(
    (j) => filter === "all" || j.status === filter
  );

  const handleDeleted = useCallback(() => mutate(), [mutate]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Coda Job</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Tutti i job di upscaling</p>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => mutate()}>
          <RefreshCw className="w-3.5 h-3.5" /> Aggiorna
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
        <TabsList>
          <TabsTrigger value="all">Tutti ({jobs?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="processing">In elaborazione</TabsTrigger>
          <TabsTrigger value="queued">In coda</TabsTrigger>
          <TabsTrigger value="completed">Completati</TabsTrigger>
          <TabsTrigger value="error">Errori</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <ListVideo className="w-10 h-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            {filter === "all" ? "Nessun job trovato. Avvia il tuo primo upscale!" : "Nessun job in questa categoria."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => (
            <JobCard key={job.id} job={job} onDeleted={handleDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}
