import { NextRequest } from "next/server";
import { getActiveConnectionServer } from "@/lib/supabase/server";

type Params = { params: Promise<{ jobId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const conn = await getActiveConnectionServer();
  if (!conn) {
    return new Response("Nessuna connessione attiva", { status: 400 });
  }

  try {
    const resp = await fetch(`${conn.pod_url}/download/${jobId}`, {
      headers: { Authorization: `Bearer ${conn.api_token}` },
    });

    if (!resp.ok) {
      return new Response(await resp.text(), { status: resp.status });
    }

    // Stream diretto senza bufferizzare in memoria
    return new Response(resp.body, {
      headers: {
        "Content-Type": resp.headers.get("Content-Type") ?? "video/mp4",
        "Content-Disposition":
          resp.headers.get("Content-Disposition") ?? `attachment; filename="${jobId}.mp4"`,
        ...(resp.headers.get("Content-Length")
          ? { "Content-Length": resp.headers.get("Content-Length")! }
          : {}),
      },
    });
  } catch {
    return new Response("Pod non raggiungibile", { status: 503 });
  }
}
