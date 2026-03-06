import { NextRequest, NextResponse } from "next/server";

const RUNPOD_GRAPHQL = "https://api.runpod.io/graphql";

const PODS_QUERY = `
  query {
    myself {
      pods {
        id
        name
        desiredStatus
        runtime {
          gpus { id gpuUtilPercent memoryUtilPercent }
        }
        machine { gpuDisplayName }
      }
    }
  }
`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const apiKey: string | undefined = body.runpod_api_key;

  if (!apiKey) {
    return NextResponse.json({ error: "runpod_api_key mancante" }, { status: 400 });
  }

  // Query GraphQL RunPod
  let pods: any[] = [];
  try {
    const gqlRes = await fetch(RUNPOD_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query: PODS_QUERY }),
    });
    const gqlData = await gqlRes.json();
    pods = gqlData?.data?.myself?.pods ?? [];
  } catch (e) {
    return NextResponse.json({ error: "Errore comunicazione RunPod API" }, { status: 502 });
  }

  // Filtra pod RUNNING e verifica health
  const running = pods.filter((p: any) => p.desiredStatus === "RUNNING");

  const results = await Promise.all(
    running.map(async (pod: any) => {
      const proxyUrl = `https://${pod.id}-7860.proxy.runpod.net`;
      let healthy = false;
      try {
        const h = await fetch(`${proxyUrl}/health`, { signal: AbortSignal.timeout(5000) });
        healthy = h.ok;
      } catch {}
      return {
        id: pod.id,
        name: pod.name ?? pod.id,
        gpu: pod.machine?.gpuDisplayName ?? "GPU",
        status: pod.desiredStatus,
        proxyUrl,
        upscalerHealthy: healthy,
      };
    })
  );

  return NextResponse.json(results);
}
