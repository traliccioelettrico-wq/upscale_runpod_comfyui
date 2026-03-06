"use client";
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveConnection, setActiveConnection } from "@/lib/supabase/queries";
import { fetchHealthForUrl } from "@/lib/api-client";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  name:      z.string().min(1, "Nome obbligatorio"),
  pod_url:   z.string().url("URL non valido").refine(u => u.startsWith("https://"), "Deve iniziare con https://"),
  api_token: z.string().min(4, "Token troppo corto"),
});
type FormData = z.infer<typeof schema>;

interface Props { onSaved: () => void }

export function ManualUrlInput({ onSaved }: Props) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "Pod Manuale", pod_url: "", api_token: "" },
  });

  async function handleTest() {
    const { pod_url } = getValues();
    if (!pod_url) return;
    setTesting(true);
    setTestResult(null);
    try {
      await fetchHealthForUrl(pod_url);
      setTestResult("ok");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  }

  async function onSubmit(data: FormData) {
    setSaving(true);
    try {
      const conn = await saveConnection({ ...data, mode: "manual", is_active: false });
      await setActiveConnection(conn.id);
      toast.success("Connessione salvata e attivata");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nome connessione</Label>
        <Input placeholder="es. Pod A40 RunPod" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>URL endpoint</Label>
        <Input placeholder="https://abc123-7860.proxy.runpod.net" {...register("pod_url")} />
        {errors.pod_url && <p className="text-xs text-destructive">{errors.pod_url.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>API Token</Label>
        <Input type="password" placeholder="Il tuo token segreto" {...register("api_token")} />
        {errors.api_token && <p className="text-xs text-destructive">{errors.api_token.message}</p>}
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={testing}>
          {testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          Testa connessione
        </Button>
        {testResult === "ok" && (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle className="w-3.5 h-3.5" /> Raggiungibile
          </span>
        )}
        {testResult === "fail" && (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <XCircle className="w-3.5 h-3.5" /> Non raggiungibile
          </span>
        )}
      </div>

      <Button type="submit" disabled={saving} className="w-full">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
        Salva e attiva
      </Button>
    </form>
  );
}
