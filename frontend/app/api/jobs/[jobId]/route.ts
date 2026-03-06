import { NextRequest, NextResponse } from "next/server";
import { getActiveConnectionServer } from "@/lib/supabase/server";

type Params = { params: Promise<{ jobId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const conn = await getActiveConnectionServer();
  if (!conn) {
    return NextResponse.json({ error: "Nessuna connessione attiva" }, { status: 400 });
  }

  try {
    const resp = await fetch(`${conn.pod_url}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${conn.api_token}` },
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch {
    return NextResponse.json({ error: "Pod non raggiungibile" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const conn = await getActiveConnectionServer();
  if (!conn) {
    return NextResponse.json({ error: "Nessuna connessione attiva" }, { status: 400 });
  }

  try {
    const resp = await fetch(`${conn.pod_url}/jobs/${jobId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${conn.api_token}` },
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch {
    return NextResponse.json({ error: "Pod non raggiungibile" }, { status: 503 });
  }
}
