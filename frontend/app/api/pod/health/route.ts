import { NextRequest, NextResponse } from "next/server";
import { getActiveConnectionServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  // Supporta ?url= per test connessione prima del salvataggio (Settings page)
  const urlParam = req.nextUrl.searchParams.get("url");

  let podUrl: string;
  let apiToken: string | null = null;

  if (urlParam) {
    podUrl = urlParam;
  } else {
    const conn = await getActiveConnectionServer();
    if (!conn) {
      return NextResponse.json({ error: "Nessuna connessione attiva" }, { status: 400 });
    }
    podUrl = conn.pod_url;
    apiToken = conn.api_token;
  }

  try {
    const headers: Record<string, string> = {};
    if (apiToken) headers["Authorization"] = `Bearer ${apiToken}`;
    const resp = await fetch(`${podUrl}/health`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch {
    return NextResponse.json({ error: "Pod non raggiungibile" }, { status: 503 });
  }
}
