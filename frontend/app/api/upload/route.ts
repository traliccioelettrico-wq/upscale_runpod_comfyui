import { NextRequest, NextResponse } from "next/server";
import { getActiveConnectionServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const conn = await getActiveConnectionServer();
  if (!conn) {
    return NextResponse.json({ error: "Nessuna connessione attiva" }, { status: 400 });
  }

  const contentType = req.headers.get("Content-Type") ?? "";

  try {
    const resp = await fetch(`${conn.pod_url}/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.api_token}`,
        "Content-Type": contentType,
      },
      body: req.body,
      // @ts-expect-error -- duplex necessario per streaming body in Node.js
      duplex: "half",
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch {
    return NextResponse.json({ error: "Errore upload al pod" }, { status: 502 });
  }
}
