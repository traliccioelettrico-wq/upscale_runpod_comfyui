import { NextRequest, NextResponse } from "next/server";
import { getActiveConnectionServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const conn = await getActiveConnectionServer();
  if (!conn) {
    return NextResponse.json({ error: "Nessuna connessione attiva" }, { status: 400 });
  }

  const body = await req.json();

  try {
    const resp = await fetch(`${conn.pod_url}/upscale/image`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.api_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch {
    return NextResponse.json({ error: "Errore comunicazione con il pod" }, { status: 502 });
  }
}
