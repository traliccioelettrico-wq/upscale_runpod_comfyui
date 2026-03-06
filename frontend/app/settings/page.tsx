"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ManualUrlInput } from "@/components/settings/ManualUrlInput";
import { PodSelector } from "@/components/settings/PodSelector";
import { useConnection } from "@/lib/connection-store";
import { getAllConnections, setActiveConnection, deleteConnection } from "@/lib/supabase/queries";
import type { Database } from "@/lib/supabase/types";
import { Trash2, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Connection = Database["public"]["Tables"]["connections"]["Row"];

export default function SettingsPage() {
  const { connection, refresh } = useConnection();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loadingConns, setLoadingConns] = useState(true);

  async function loadConnections() {
    try {
      const list = await getAllConnections();
      setConnections(list);
    } finally {
      setLoadingConns(false);
    }
  }

  useEffect(() => { loadConnections(); }, []);

  async function handleActivate(id: string) {
    try {
      await setActiveConnection(id);
      await Promise.all([loadConnections(), refresh()]);
      toast.success("Connessione attivata");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteConnection(id);
      await Promise.all([loadConnections(), refresh()]);
      toast.success("Connessione eliminata");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function onSaved() {
    loadConnections();
    refresh();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Impostazioni</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configura la connessione al pod RunPod con l&apos;upscaler.
        </p>
      </div>

      {/* Connessioni salvate */}
      {connections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connessioni salvate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingConns ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              connections.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-md border border-border">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      {c.name}
                      {c.is_active && (
                        <Badge variant="default" className="text-xs">Attiva</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.pod_url}</p>
                  </div>
                  <div className="flex gap-2">
                    {!c.is_active && (
                      <Button size="sm" variant="outline" onClick={() => handleActivate(c.id)}>
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Attiva
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Aggiungi nuova connessione */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aggiungi connessione</CardTitle>
          <CardDescription>
            Usa l&apos;auto-discovery per trovare pod RunPod attivi, oppure inserisci manualmente i dati.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="auto">
            <TabsList className="mb-4">
              <TabsTrigger value="auto">Auto-discovery</TabsTrigger>
              <TabsTrigger value="manual">Manuale</TabsTrigger>
            </TabsList>
            <TabsContent value="auto">
              <PodSelector onSaved={onSaved} />
            </TabsContent>
            <TabsContent value="manual">
              <ManualUrlInput onSaved={onSaved} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
