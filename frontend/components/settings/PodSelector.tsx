"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Search } from "lucide-react";
import { discoverPods } from "@/lib/runpod-client";
import type { PodInfo } from "@/lib/types";
import { saveConnection, setActiveConnection } from "@/lib/supabase/queries";
import { toast } from "sonner";

interface Props { onSaved: () => void }

export function PodSelector({ onSaved }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [pods, setPods] = useState<PodInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleDiscover() {
    if (!apiKey) return;
    setDiscovering(true);
    setPods([]);
    setSelected(null);
    try {
      const list = await discoverPods(apiKey);
      setPods(list);
      if (list.length === 1) setSelected(list[0].id);
      if (list.length === 0) toast.info("Nessun pod attivo trovato");
    } catch (e: any) {
      toast.error(e.message ?? "Errore discovery");
    } finally {
      setDiscovering(false);
    }
  }

  async function handleSave() {
    const pod = pods.find((p) => p.id === selected);
    if (!pod || !apiToken) return;
    setSaving(true);
    try {
      const conn = await saveConnection({
        name: pod.name,
        mode: "auto",
        pod_url: pod.proxyUrl,
        api_token: apiToken,
        runpod_api_key: apiKey,
        pod_id: pod.id,
        is_active: false,
      });
      await setActiveConnection(conn.id);
      toast.success(`Connesso a ${pod.name}`);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>RunPod API Key</Label>
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="La tua API key RunPod"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1"
          />
          <Button variant="outline" onClick={handleDiscover} disabled={!apiKey || discovering}>
            {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {pods.length > 0 && (
        <div className="space-y-2">
          <Label>Pod trovati</Label>
          {pods.map((pod) => (
            <button
              key={pod.id}
              type="button"
              onClick={() => setSelected(pod.id)}
              className={`w-full flex items-center justify-between p-3 rounded-md border text-left transition-colors ${
                selected === pod.id
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <div>
                <p className="text-sm font-medium">{pod.name}</p>
                <p className="text-xs text-muted-foreground">{pod.gpu}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={pod.status === "RUNNING" ? "default" : "secondary"}>
                  {pod.status}
                </Badge>
                {pod.upscalerHealthy ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-1.5">
          <Label>API Token upscaler</Label>
          <Input
            type="password"
            placeholder="Token impostato nel pod"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
          />
          <Button
            className="w-full mt-2"
            onClick={handleSave}
            disabled={!apiToken || saving}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Salva e attiva
          </Button>
        </div>
      )}
    </div>
  );
}
