# Piano Progetto — Frontend Video Upscaler

## 1. Panoramica

Interfaccia web professionale in **Next.js 14+ (App Router) + TypeScript + Tailwind CSS** per controllare il server API di upscaling video su pod RunPod remoti. **Supabase locale** come database per persistenza job, configurazioni connessione, storico video e preferenze utente.

L'app gira in locale (o su un server proprio) e comunica con il pod RunPod remoto tramite le API REST gia' esistenti (`api_server.py`).

---

## 2. Architettura

```
Browser (localhost:3000)
    |
    v
Next.js App (frontend + API routes proxy)
    |
    +---> Supabase locale (localhost:54321)
    |         -> Persistenza job, connessioni, video metadata, preferenze
    |
    +---> RunPod GraphQL API (https://api.runpod.io/graphql)
    |         -> Lista pod attivi
    |         -> Ricava pod_id e costruisce URL proxy
    |
    +---> Upscaler API (https://<pod_id>-7860.proxy.runpod.net)
              -> /health          (no auth)
              -> /upload          (Bearer token, multipart)
              -> /upscale         (Bearer token)
              -> /status/{job_id} (Bearer token)
              -> /download/{job_id} (Bearer token)
              -> /jobs            (Bearer token)
              -> DELETE /jobs/{job_id} (Bearer token)
```

### Perche' API routes proxy in Next.js

Le chiamate dal browser verso il pod RunPod possono avere problemi CORS. Le API routes Next.js (`app/api/...`) fungono da proxy server-side, risolvendo CORS e nascondendo i token dal client.

---

## 3. Auto-discovery URL pod

### Flusso

1. L'utente inserisce una sola volta la **RunPod API Key** (salvata nella tabella `connections` di Supabase, mai esposta al browser nei network tab grazie al proxy server-side).
2. L'app chiama `POST /api/pods` (route Next.js) che internamente interroga RunPod GraphQL:
   ```graphql
   query {
     myself {
       pods {
         id
         name
         desiredStatus
         runtime { ports { ip isIpPublic privatePort publicPort type } }
       }
     }
   }
   ```
3. Filtra i pod con `desiredStatus == "RUNNING"`.
4. Per ogni pod running, costruisce l'URL candidato: `https://<pod_id>-7860.proxy.runpod.net`
5. Chiama `/health` su ciascun URL candidato per verificare che l'upscaler API sia attivo.
6. Presenta all'utente la lista dei pod con upscaler attivo. L'utente seleziona (o viene auto-selezionato se ce n'e' uno solo).
7. L'URL e l'API Token dell'upscaler vengono salvati nella tabella `connections` di Supabase.

### Configurazione manuale (fallback)

Se l'utente non ha RunPod API Key o preferisce, puo' inserire manualmente:
- URL diretto del pod (es. `https://abc123-7860.proxy.runpod.net`)
- API Token dell'upscaler

---

## 4. Stack tecnologico

| Componente | Tecnologia |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Linguaggio | TypeScript (strict) |
| Styling | Tailwind CSS 3 |
| Componenti UI | shadcn/ui (basato su Radix UI) |
| Icone | Lucide React |
| Database | Supabase locale (PostgreSQL + API auto-generata) |
| ORM | Supabase JS client (`@supabase/supabase-js`) |
| HTTP client | fetch nativo (server) + SWR (client, polling) |
| Video metadata | Lato client: libreria `mediainfo.js` (WASM, estrae codec/fps/risoluzione senza upload) |
| State management | React Context (runtime) + Supabase (persistenza) |
| Form validation | Zod + react-hook-form |

---

## 5. Database — Supabase locale

### Perche' Supabase locale

- **Zero infrastruttura cloud** per la v1: tutto gira in locale con `supabase start` (Docker).
- PostgreSQL completo con API REST auto-generata (PostgREST).
- Client JS tipizzato con generazione automatica dei tipi dallo schema.
- Dashboard admin locale su `localhost:54323` per ispezionare i dati.
- Migrazione a Supabase cloud e' un cambio di URL + chiavi, zero modifiche al codice.

### Schema database

```sql
-- supabase/migrations/001_initial_schema.sql

-- Connessioni ai pod salvate dall'utente
CREATE TABLE connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,                    -- nome amichevole (es. "Pod GPU A40")
  mode          TEXT NOT NULL CHECK (mode IN ('auto', 'manual')),
  pod_url       TEXT NOT NULL,                    -- https://<pod_id>-7860.proxy.runpod.net
  api_token     TEXT NOT NULL,                    -- token Bearer per l'upscaler API
  runpod_api_key TEXT,                            -- chiave RunPod (solo mode=auto)
  pod_id        TEXT,                             -- pod ID RunPod (solo mode=auto)
  is_active     BOOLEAN NOT NULL DEFAULT false,   -- una sola connessione attiva alla volta
  last_health   JSONB,                            -- cache ultimo /health response
  last_seen_at  TIMESTAMPTZ,                      -- ultimo health check OK
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un solo record con is_active = true
CREATE UNIQUE INDEX idx_connections_active ON connections (is_active) WHERE is_active = true;

-- Job di upscaling (mirror + arricchimento dei dati dal server remoto)
CREATE TABLE jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_job_id   TEXT NOT NULL UNIQUE,           -- job_id ritornato dal server API (UNIQUE per upsert)
  connection_id   UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'processing', 'completed', 'error')),
  progress        INTEGER NOT NULL DEFAULT 0,     -- 0-100
  current_node    TEXT,                           -- nodo ComfyUI corrente
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  message         TEXT,                           -- messaggio errore se status=error

  -- Parametri richiesta (salvati localmente per consultazione anche se il pod si spegne)
  video_filename      TEXT NOT NULL,
  target_height       INTEGER NOT NULL,
  interpolate         BOOLEAN NOT NULL DEFAULT false,
  fps_multiplier      INTEGER NOT NULL DEFAULT 2,
  output_filename     TEXT,

  -- Metadata video sorgente (da mediainfo.js)
  source_width        INTEGER,
  source_height       INTEGER,
  source_fps          REAL,
  source_duration     REAL,                       -- secondi
  source_total_frames INTEGER,
  source_codec        TEXT,
  source_file_size    BIGINT,                     -- bytes

  -- Output
  output_remote_filename TEXT,                    -- filename sul pod (da /status)
  output_downloaded_path TEXT,                    -- path locale se scaricato

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ                       -- timestamp completamento
);

CREATE INDEX idx_jobs_connection ON jobs(connection_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created ON jobs(created_at DESC);

-- Preferenze utente (chiave-valore)
CREATE TABLE preferences (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger per aggiornare updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_connections_updated
  BEFORE UPDATE ON connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_jobs_updated
  BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_preferences_updated
  BEFORE UPDATE ON preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Dati di seed

```sql
-- supabase/seed.sql

-- Preferenze di default
INSERT INTO preferences (key, value) VALUES
  ('theme', '"dark"'),
  ('default_target_height', '1080'),
  ('default_interpolate', 'false'),
  ('default_fps_multiplier', '2'),
  ('polling_interval_ms', '3000')
ON CONFLICT (key) DO NOTHING;
```

### Cosa persiste il database vs cosa resta sul server remoto

| Dato | Supabase locale | Server remoto (api_server.py) |
|---|---|---|
| Configurazioni connessione (URL, token) | SI (tabella `connections`) | NO |
| Parametri job (risoluzione, interpolazione) | SI (tabella `jobs`) | SI (in memoria, perso al restart) |
| Metadata video sorgente | SI (colonne `source_*` in `jobs`) | NO |
| Progresso job in tempo reale | SI (aggiornato via polling) | SI (fonte primaria) |
| Stato job storico | SI (persiste anche dopo spegnimento pod) | NO (perso al restart) |
| Preferenze UI (tema, default) | SI (tabella `preferences`) | NO |
| File video output | NO (solo path locale se scaricato) | SI (su disco pod) |

**Vantaggio chiave:** Quando il pod RunPod viene spento e riacceso, il frontend mantiene lo storico completo di tutti i job passati con parametri, metadata e stato finale.

### Client Supabase

Due client separati: uno per il browser (componenti client), uno per il server (API routes).

```typescript
// lib/supabase/client.ts — per componenti client ("use client")
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

```typescript
// lib/supabase/server.ts — per API routes e Server Components
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function createServerClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Nota:** In Supabase locale senza auth, entrambi i client usano la `anon` key. In produzione con auth attiva, il server client puo' usare la `SUPABASE_SERVICE_ROLE_KEY` per bypassare RLS nelle API routes.

```typescript
// lib/supabase/queries.ts — query helper tipizzate

import { createClient } from "./client";
import type { Database } from "./types";

// Tipo generato da Supabase per INSERT nella tabella jobs
type JobInsert = Database["public"]["Tables"]["jobs"]["Insert"];

export async function getActiveConnection() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("is_active", true)
    .single();
  // .single() ritorna errore PGRST116 se 0 righe — non e' un errore critico,
  // significa solo che nessuna connessione e' configurata.
  if (error && error.code !== "PGRST116") {
    throw new Error(`Errore lettura connessione: ${error.message}`);
  }
  return data;   // null se nessuna connessione attiva
}

/**
 * Attiva una connessione disattivando tutte le altre.
 * Necessario perche' l'indice UNIQUE su is_active=true ammette un solo record attivo.
 */
export async function setActiveConnection(connectionId: string) {
  const supabase = createClient();
  // Disattiva solo quella attualmente attiva (se diversa da quella richiesta)
  await supabase.from("connections").update({ is_active: false }).eq("is_active", true).neq("id", connectionId);
  // Attiva quella selezionata
  const { error } = await supabase
    .from("connections")
    .update({ is_active: true })
    .eq("id", connectionId);
  if (error) throw new Error(`Errore attivazione connessione: ${error.message}`);
}

export async function upsertJob(remoteJobId: string, connectionId: string, params: JobInsert) {
  const supabase = createClient();
  // Funziona grazie al vincolo UNIQUE su remote_job_id nello schema
  const { error } = await supabase
    .from("jobs")
    .upsert({ remote_job_id: remoteJobId, connection_id: connectionId, ...params },
            { onConflict: "remote_job_id" });
  if (error) throw new Error(`Errore upsert job: ${error.message}`);
}

/**
 * Aggiorna il job locale con i dati ricevuti dal polling remoto.
 * Accetta un oggetto parziale per poter aggiornare campi diversi
 * a seconda dello stato (progress, current_node, completed_at, message, etc.)
 */
export async function syncJobFromRemote(
  remoteJobId: string,
  updates: {
    status?: string;
    progress?: number;
    current_node?: string | null;
    elapsed_seconds?: number;
    message?: string | null;
    output_remote_filename?: string | null;
    completed_at?: string | null;
  }
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("remote_job_id", remoteJobId);
  if (error) throw new Error(`Errore sync job: ${error.message}`);
}

export async function getJobHistory(limit = 50) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*, connections(name, pod_url)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Errore lettura storico job: ${error.message}`);
  return data ?? [];
}

export async function getPreference<T = unknown>(key: string): Promise<T | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("preferences")
    .select("value")
    .eq("key", key)
    .single();
  if (error) return null;    // preferenza non trovata, non e' un errore
  return data?.value as T;
}

export async function setPreference(key: string, value: unknown) {
  const supabase = createClient();
  // NOTA: NON usare JSON.stringify(value) — il client Supabase serializza
  // automaticamente i valori JSONB. JSON.stringify causerebbe double-encoding.
  const { error } = await supabase
    .from("preferences")
    .upsert({ key, value: value as any });
  if (error) throw new Error(`Errore salvataggio preferenza: ${error.message}`);
}
```

### Sincronizzazione job (polling)

Quando il frontend fa polling su `/status/{jobId}`, aggiorna anche il record locale in Supabase:

```
1. SWR chiama GET /api/jobs/{jobId}  (proxy -> pod remoto)
2. Riceve { status, progress, current_node, elapsed_seconds, output_filename, message }
3. Chiama syncJobFromRemote() su Supabase con i dati freschi:
   syncJobFromRemote(remoteJobId, {
     status, progress, current_node, elapsed_seconds,
     ...(status === "completed" && {
       output_remote_filename: output_filename,
       completed_at: new Date().toISOString(),
     }),
     ...(status === "error" && { message }),
   })
```

Questo garantisce che anche se il pod viene spento, lo stato finale del job e' persistito localmente.

---

## 6. Struttura progetto

```
frontend/
  app/
    layout.tsx                  # Layout root con sidebar/header
    page.tsx                    # Redirect a /dashboard
    dashboard/
      page.tsx                  # Vista principale: status connessione + riepilogo job
    upscale/
      page.tsx                  # Upload video + configurazione parametri + invio job
    jobs/
      page.tsx                  # Lista job con progress bar
      [jobId]/
        page.tsx                # Dettaglio singolo job + download
    settings/
      page.tsx                  # Connessione pod: RunPod API Key, selezione pod, token
    api/
      pods/
        route.ts                # Proxy: RunPod GraphQL -> lista pod
      pod/
        health/
          route.ts              # Proxy: GET /health sul pod selezionato
      upload/
        route.ts                # Proxy: POST /upload (multipart -> pod)
      upscale/
        route.ts                # Proxy: POST /upscale
      jobs/
        route.ts                # Proxy: GET /jobs
        [jobId]/
          route.ts              # Proxy: GET /status/{jobId}, DELETE /jobs/{jobId}
          download/
            route.ts            # Proxy: GET /download/{jobId} -> stream video
  components/
    layout/
      Sidebar.tsx               # Navigazione laterale
      Header.tsx                # Header con stato connessione
      ConnectionBadge.tsx       # Indicatore verde/rosso stato pod
    upscale/
      VideoDropzone.tsx         # Drag & drop / click upload video
      VideoMetadata.tsx         # Mostra info video (risoluzione, fps, durata, orientamento)
      ResolutionSelector.tsx    # Selezione risoluzione target (720p/1080p/1440p/4K)
      InterpolationConfig.tsx   # Toggle interpolazione + selettore moltiplicatore
      UpscaleForm.tsx           # Form completo che compone i componenti sopra
    jobs/
      JobCard.tsx               # Card singolo job con progress bar
      JobList.tsx               # Lista scrollabile di JobCard
      ProgressBar.tsx           # Barra progresso animata con percentuale
      JobStatusBadge.tsx        # Badge colorato per stato (queued/processing/completed/error)
    settings/
      RunPodKeyInput.tsx        # Input RunPod API key con validazione
      PodSelector.tsx           # Dropdown pod disponibili con health check
      ManualUrlInput.tsx        # Input manuale URL + token (fallback)
      ConnectionTest.tsx        # Pulsante test connessione con feedback
    ui/                         # Componenti shadcn/ui (button, card, input, dialog, etc.)
  lib/
    api-client.ts               # Funzioni fetch tipizzate per ogni endpoint
    runpod-client.ts            # Client RunPod GraphQL API
    supabase/
      client.ts                 # Client Supabase browser (per componenti "use client")
      server.ts                 # Client Supabase server (per API routes e Server Components)
      types.ts                  # Tipi generati dallo schema DB (`supabase gen types`)
      queries.ts                # Query helper tipizzate (jobs, connections, preferenze)
    video-metadata.ts           # Wrapper mediainfo.js per estrazione metadata
    types.ts                    # Tipi TypeScript condivisi
    constants.ts                # Risoluzioni, moltiplicatori, etc.
    connection-store.ts         # Context React (legge da Supabase invece di localStorage)
    utils.ts                    # Utility (formattazione tempo, dimensioni file, etc.)
  supabase/
    config.toml                 # Configurazione Supabase locale
    migrations/
      001_initial_schema.sql    # Schema iniziale
    seed.sql                    # Dati di seed (risoluzioni default, etc.)
  public/
    (assets statici)
```

---

## 7. Pagine — Specifiche dettagliate

### 7.1 Settings (`/settings`)

**Scopo:** Configurazione connessione al pod remoto.

**Layout:**
```
+--------------------------------------------------+
|  Connessione RunPod                               |
+--------------------------------------------------+
|                                                    |
|  [A] Auto-discovery (consigliato)                 |
|  +----------------------------------------------+ |
|  | RunPod API Key  [________________________]    | |
|  | [Cerca pod attivi]                            | |
|  |                                               | |
|  | Pod trovati:                                  | |
|  | (*) gpu-pod-abc123  RTX 4090  RUNNING  [OK]   | |
|  | ( ) gpu-pod-def456  A40      RUNNING  [--]    | |
|  +----------------------------------------------+ |
|                                                    |
|  [B] Configurazione manuale                       |
|  +----------------------------------------------+ |
|  | URL endpoint  [________________________]      | |
|  | API Token     [________________________]      | |
|  | [Testa connessione]                           | |
|  +----------------------------------------------+ |
|                                                    |
|  Stato: [*] Connesso a gpu-pod-abc123             |
|         ComfyUI: raggiungibile                    |
|         Coda: 0 job attivi                        |
+--------------------------------------------------+
```

**Comportamento:**
- La RunPod API Key viene inviata solo alle API routes Next.js (proxy), mai esposta nel browser network.
- Il pod selector mostra nome, GPU, stato. Un badge verde appare se `/health` risponde OK.
- Al salvataggio, i dati vengono scritti nella tabella `connections` di Supabase e caricati nel Context React.
- Se non configurato, tutte le altre pagine mostrano un banner "Configura connessione".

---

### 7.2 Dashboard (`/dashboard`)

**Scopo:** Vista riepilogativa.

**Layout:**
```
+--------------------------------------------------+
|  Dashboard                                        |
+--------------------------------------------------+
|                                                    |
|  +------------+  +------------+  +------------+   |
|  | Connessione|  | Job attivi |  | Completati |   |
|  |   ONLINE   |  |     2      |  |     14     |   |
|  +------------+  +------------+  +------------+   |
|                                                    |
|  Job recenti                                      |
|  +----------------------------------------------+ |
|  | video1.mp4  4K  Processing  [=====>  ] 67%   | |
|  | video2.mp4  1080p Completed [==========] 100%| |
|  | video3.mp4  4K  Queued      [          ]  0% | |
|  +----------------------------------------------+ |
|                                                    |
|  [+ Nuovo Upscale]                                |
+--------------------------------------------------+
```

**Dati:**
- Stato connessione: da `/health`
- Job recenti: da Supabase locale (storico completo) + polling `/jobs` per quelli attivi

---

### 7.3 Upscale (`/upscale`)

**Scopo:** Caricare un video, visualizzarne i metadati, configurare i parametri e lanciare il job.

**Layout:**
```
+--------------------------------------------------+
|  Nuovo Upscale                                    |
+--------------------------------------------------+
|                                                    |
|  1. Video sorgente                                |
|  +----------------------------------------------+ |
|  |                                               | |
|  |     Trascina un video qui                     | |
|  |     oppure [Sfoglia file]                     | |
|  |                                               | |
|  +----------------------------------------------+ |
|                                                    |
|  (dopo upload)                                    |
|  +----------------------------------------------+ |
|  | nome_video.mp4                                | |
|  | Risoluzione: 1920x1080 (16:9 orizzontale)    | |
|  | Codec: H.264                                  | |
|  | FPS: 24                                       | |
|  | Durata: 00:02:34                              | |
|  | Frame totali: 3696                            | |
|  | Dimensione: 48.2 MB                           | |
|  +----------------------------------------------+ |
|                                                    |
|  2. Parametri upscaling                           |
|  +----------------------------------------------+ |
|  | Risoluzione target                            | |
|  |  ( ) 720p HD                                  | |
|  |  (*) 1080p Full HD                            | |
|  |  ( ) 1440p 2K                                 | |
|  |  ( ) 2160p 4K                                 | |
|  |                                               | |
|  | Preview: 1920x1080 -> 3840x2160               | |
|  +----------------------------------------------+ |
|                                                    |
|  3. Frame Interpolation                           |
|  +----------------------------------------------+ |
|  | [x] Attiva interpolazione frame               | |
|  |                                               | |
|  | Moltiplicatore FPS                            | |
|  |  (*) x2  (24fps -> 48fps)                    | |
|  |  ( ) x3  (24fps -> 72fps)                    | |
|  |  ( ) x4  (24fps -> 96fps)                    | |
|  +----------------------------------------------+ |
|                                                    |
|  4. Output                                        |
|  +----------------------------------------------+ |
|  | Nome file output (opzionale)                  | |
|  | [____________________________]                | |
|  +----------------------------------------------+ |
|                                                    |
|  [Avvia Upscale]                                  |
+--------------------------------------------------+
```

**Flusso tecnico:**
1. L'utente trascina/seleziona un file video.
2. `mediainfo.js` (WASM) analizza il file **localmente nel browser** ed estrae i metadati (nessun upload a questo punto).
3. L'utente configura i parametri. La preview calcola la risoluzione finale in tempo reale.
4. I selettori FPS mostrano il valore calcolato (es. "24fps -> 48fps") basato sui metadati reali del video.
5. Al click su "Avvia Upscale":
   a. Il video viene **uploadato** al pod tramite `POST /api/upload` (proxy -> `POST /upload` sul pod, Opzione C sez. 9). Il pod salva il file in `ComfyUI/input/` e ritorna il `filename`.
   b. Il `filename` viene inviato a `POST /api/upscale` (proxy -> `POST /upscale` sul pod) nel campo `video_filename`.
   c. Il job viene salvato in Supabase con i metadata e i parametri.
   d. L'utente viene reindirizzato alla pagina del job.

---

### 7.4 Jobs (`/jobs`)

**Scopo:** Lista completa dei job con stato in tempo reale.

**Layout:**
```
+--------------------------------------------------+
|  Coda Job                                         |
|  [Aggiorna]                     Filtro: [Tutti v]|
+--------------------------------------------------+
|                                                    |
|  +----------------------------------------------+ |
|  | #1  video_promo.mp4                          | |
|  | Target: 4K | Interpolazione: x2               | |
|  | Stato: Processing                             | |
|  | [========================>     ] 78%          | |
|  | Tempo: 4m 23s                    [Dettagli]  | |
|  +----------------------------------------------+ |
|                                                    |
|  +----------------------------------------------+ |
|  | #2  intro_final.mp4                          | |
|  | Target: 1080p | Interpolazione: OFF           | |
|  | Stato: Completed                              | |
|  | [================================] 100%       | |
|  | Tempo: 2m 11s       [Download] [Elimina]     | |
|  +----------------------------------------------+ |
|                                                    |
|  +----------------------------------------------+ |
|  | #3  clip_001.mp4                             | |
|  | Target: 4K | Interpolazione: x3               | |
|  | Stato: Queued                                 | |
|  | [                              ]  0%          | |
|  |                                  [Elimina]   | |
|  +----------------------------------------------+ |
+--------------------------------------------------+
```

**Comportamento:**
- Polling automatico `/jobs` ogni 3 secondi (con SWR `refreshInterval`).
- Per job in `processing`: polling `/status/{jobId}` ogni 2 secondi per progress granulare.
- Filtri: Tutti / In coda / In elaborazione / Completati / Errori
- Azioni per job:
  - `queued`: Elimina
  - `processing`: solo visualizzazione
  - `completed`: Download, Elimina
  - `error`: Dettagli errore, Elimina

---

### 7.5 Dettaglio Job (`/jobs/[jobId]`)

**Scopo:** Vista dettagliata di un singolo job.

**Layout:**
```
+--------------------------------------------------+
|  <- Torna alla lista                              |
|  Job: video_promo.mp4                             |
+--------------------------------------------------+
|                                                    |
|  Stato: [PROCESSING]            Tempo: 4m 23s    |
|                                                    |
|  [========================>               ] 78%   |
|  Nodo corrente: ImageUpscaleWithModel             |
|                                                    |
|  +----------------------------------------------+ |
|  | Parametri                                     | |
|  | Video:          video_promo.mp4               | |
|  | Risoluzione:    1080p -> 4K                   | |
|  | Interpolazione: ON x2 (24fps -> 48fps)        | |
|  | Output:         video_promo_4k                | |
|  +----------------------------------------------+ |
|                                                    |
|  (quando completato)                              |
|  +----------------------------------------------+ |
|  | Output                                        | |
|  | File: Upscaled_video_promo_4k.mp4             | |
|  | [Download video]                              | |
|  +----------------------------------------------+ |
|                                                    |
|  [Elimina job]                                    |
+--------------------------------------------------+
```

---

## 8. API Routes Next.js (proxy)

Ogni route fa da proxy verso il pod remoto, aggiungendo il Bearer token e gestendo errori.

| Route Next.js | Metodo | Destinazione pod |
|---|---|---|
| `POST /api/pods` | POST | RunPod GraphQL API (riceve `runpod_api_key` nel body della richiesta) |
| `GET /api/pod/health` | GET | `{podUrl}/health` (accetta `?url=` per test prima del salvataggio) |
| `POST /api/upscale` | POST | `{podUrl}/upscale` |
| `GET /api/jobs` | GET | `{podUrl}/jobs` |
| `GET /api/jobs/[jobId]` | GET | `{podUrl}/status/{jobId}` |
| `DELETE /api/jobs/[jobId]` | DELETE | `{podUrl}/jobs/{jobId}` |
| `GET /api/jobs/[jobId]/download` | GET | `{podUrl}/download/{jobId}` (stream) |
| `POST /api/upload` | POST | Proxy: multipart upload -> `{podUrl}/upload` (Opzione C, sez. 9) |

### Pattern generico di ogni proxy route

Le API routes leggono la connessione attiva direttamente da Supabase server-side.
Questo evita di passare token via header dal browser (piu' sicuro e pulito).

```typescript
// app/api/jobs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const { data: conn, error } = await supabase
    .from("connections")
    .select("pod_url, api_token")
    .eq("is_active", true)
    .single();

  if (error || !conn) {
    return NextResponse.json({ error: "Nessuna connessione attiva" }, { status: 400 });
  }

  const resp = await fetch(`${conn.pod_url}/jobs`, {
    headers: { Authorization: `Bearer ${conn.api_token}` },
  });

  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}
```

### Download video — streaming proxy

Il download di video grandi deve essere streammato per evitare di bufferizzare tutto in memoria:

```typescript
// app/api/jobs/[jobId]/download/route.ts
import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = createServerClient();
  const { data: conn } = await supabase
    .from("connections")
    .select("pod_url, api_token")
    .eq("is_active", true)
    .single();

  if (!conn) {
    return new Response("Nessuna connessione attiva", { status: 400 });
  }

  const resp = await fetch(`${conn.pod_url}/download/${params.jobId}`, {
    headers: { Authorization: `Bearer ${conn.api_token}` },
  });

  if (!resp.ok) {
    return new Response(await resp.text(), { status: resp.status });
  }

  // Stream diretto senza bufferizzare in memoria
  return new Response(resp.body, {
    headers: {
      "Content-Type": resp.headers.get("Content-Type") ?? "video/mp4",
      "Content-Disposition": resp.headers.get("Content-Disposition") ?? "attachment",
      "Content-Length": resp.headers.get("Content-Length") ?? "",
    },
  });
}
```

### Upload video — streaming proxy (Opzione C)

```typescript
// app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// In App Router, il body non viene parsato automaticamente — si accede
// direttamente al ReadableStream tramite req.body. Nessuna config necessaria.

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const { data: conn } = await supabase
    .from("connections")
    .select("pod_url, api_token")
    .eq("is_active", true)
    .single();

  if (!conn) {
    return NextResponse.json({ error: "Nessuna connessione attiva" }, { status: 400 });
  }

  // Inoltra il body multipart al pod
  const resp = await fetch(`${conn.pod_url}/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.api_token}`,
      "Content-Type": req.headers.get("Content-Type") ?? "",
    },
    body: req.body,
    // @ts-expect-error -- duplex required for streaming body in Node.js
    duplex: "half",
  });

  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}
```

---

## 9. Upload video — Strategia

**Problema:** L'endpoint `POST /upscale` originale accetta solo `video_url` (URL pubblico da cui il pod scarica il video). L'utente carica il file dal browser, che non e' un URL pubblico. Le modifiche sotto aggiungono il supporto a `video_filename` come alternativa (file gia' presente sul pod).

**Soluzioni:**

### Opzione C — Endpoint upload diretto sul pod (CONSIGLIATA)
1. Aggiungere un endpoint `POST /upload` al server API che accetta multipart file upload.
2. Il file viene salvato direttamente in `ComfyUI/input/`.
3. L'endpoint ritorna il filename, che viene poi usato nel job.
4. **Soluzione piu' pulita e affidabile** — richiede una piccola modifica al backend.
5. Il frontend fa proxy dell'upload tramite `POST /api/upload` (API route Next.js) che inoltra il multipart al pod.

### Opzione B — Upload su storage cloud (alternativa per file molto grandi)
1. L'utente carica il video su un bucket S3/GCS/R2 con presigned URL.
2. L'URL del file nel bucket viene passato a `POST /upscale`.
3. Piu' affidabile per file molto grandi (>2 GB) ma richiede configurazione cloud storage.

### Opzione A — Temporary file server in Next.js (NON consigliata)
1. L'utente carica il video su `POST /api/upload` (API route Next.js).
2. Il file viene salvato in `/tmp/uploads/` con un UUID.
3. Next.js espone il file su `GET /api/files/[fileId]` come URL pubblico.
4. Il pod scarica il video dalla macchina dove gira Next.js.
5. **NON funziona se Next.js gira su localhost dietro NAT** (caso piu' comune in sviluppo). Funziona solo se il server Next.js ha un IP pubblico raggiungibile dal pod.

**Raccomandazione:** Implementare **Opzione C** — e' la piu' semplice, affidabile, e funziona sempre (il pod riceve il file direttamente). L'unica limitazione e' la dimensione massima gestibile da Vercel in produzione (body limit 4.5 MB per serverless functions). Per file grandi in produzione: usare Opzione B (presigned URL su cloud storage) oppure upload diretto dal browser al pod (bypass Vercel). In sviluppo locale, nessun limite.

### Modifiche necessarie a `api_server.py` per Opzione C

**1. Nuovo endpoint `POST /upload`:**
```python
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

@app.post("/upload", tags=["Upscaling"])
async def upload_video(
    file: UploadFile = File(...),
    token: str = Depends(verify_token),
):
    """Carica un video direttamente nella cartella input di ComfyUI."""
    # Valida estensione
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Formato non supportato: {ext}")

    input_dir = Path(COMFYUI_PATH) / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest = input_dir / safe_name
    async with aiofiles.open(dest, "wb") as f:
        while chunk := await file.read(8192):
            await f.write(chunk)
    return {"filename": safe_name}
```

**2. Modifica `UpscaleRequest`:**
```python
class UpscaleRequest(BaseModel):
    video_url: Optional[str] = None       # URL pubblico (download remoto)
    video_filename: Optional[str] = None  # File gia' in ComfyUI/input/ (da POST /upload)
    # ... altri campi invariati ...

    @root_validator
    def validate_video_source(cls, values):
        if not values.get("video_url") and not values.get("video_filename"):
            raise ValueError("Specificare video_url o video_filename")
        return values
```

**Nota:** Usare `@root_validator` (non `@validator` su un singolo campo) perche' la validazione dipende da due campi e Pydantic v1 valida i campi in ordine di definizione.

**3. Modifica logica download in `POST /upscale`:**
Se `video_filename` e' presente, salta il download e usa direttamente il file gia' in `ComfyUI/input/`. Se `video_url` e' presente, scarica come prima.

---

## 10. Tipi TypeScript principali

```typescript
// lib/types.ts
// Tipi applicativi. I tipi delle tabelle Supabase sono auto-generati in lib/supabase/types.ts

// --- RunPod ---

export interface PodInfo {
  id: string;
  name: string;
  gpu: string;
  status: string;
  proxyUrl: string;
  upscalerHealthy: boolean;
}

// --- API server remoto ---

export interface HealthResponse {
  status: string;
  comfyui: "reachable" | "unreachable";
  comfyui_url: string;
  queue_size: number;
  active_jobs: number;
  max_concurrent_jobs: number;
}

export interface RemoteJobSummary {
  job_id: string;
  status: "queued" | "processing" | "completed" | "error";
  progress: number;
  elapsed_seconds: number;
  output_filename: string | null;
}

export interface RemoteJobDetail extends RemoteJobSummary {
  current_node: string | null;
  message: string | null;
}

// --- Video ---

export interface VideoMetadata {
  filename: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  totalFrames: number;
  codec: string;
  orientation: "landscape" | "portrait" | "square";
  aspectRatio: string;
  fileSize: number;
}

// --- Parametri ---

export type TargetResolution = 720 | 1080 | 1440 | 2160;
export type FpsMultiplier = 2 | 3 | 4;

export interface UpscaleParams {
  videoUrl?: string;
  videoFilename?: string;
  targetHeight: TargetResolution;
  interpolate: boolean;
  fpsMultiplier: FpsMultiplier;
  outputFilename?: string;
}

// --- Tipi composti (Supabase + dati remoti) ---

// Un job come visualizzato nel frontend: dati Supabase + stato live dal pod
export interface JobView {
  // Da Supabase
  id: string;                         // UUID locale
  remoteJobId: string;                // job_id sul server remoto
  videoFilename: string;
  targetHeight: TargetResolution;
  interpolate: boolean;
  fpsMultiplier: FpsMultiplier;
  sourceWidth: number | null;
  sourceHeight: number | null;
  sourceFps: number | null;
  createdAt: string;

  // Aggiornato dal polling remoto e salvato in Supabase
  status: "queued" | "processing" | "completed" | "error";
  progress: number;
  currentNode: string | null;
  elapsedSeconds: number;
  message: string | null;
  outputFilename: string | null;
  completedAt: string | null;

  // Connessione associata
  connectionName: string;
  podUrl: string;
}
```

---

## 11. Polling e aggiornamento in tempo reale

| Dato | Endpoint | Frequenza | Libreria |
|---|---|---|---|
| Health pod | `GET /api/pod/health` | 10 secondi | SWR `refreshInterval` |
| Lista job | `GET /api/jobs` | 3 secondi (se ci sono job attivi) | SWR `refreshInterval` |
| Progresso job singolo | `GET /api/jobs/{id}` | 2 secondi (solo se `processing`) | SWR `refreshInterval` |

SWR gestisce automaticamente deduplicazione, caching e revalidazione. Il polling si attiva solo quando la pagina e' visibile (`revalidateOnFocus`).

---

## 12. Design e UI

### Principi
- **Dark mode** come default (tipico per tool video/produzione), con toggle light mode.
- Palette colori: grigio scuro + accenti blu/viola per azioni, verde per successo, rosso per errori.
- Sidebar fissa a sinistra con navigazione.
- Tipografia pulita: Inter o Geist Sans.
- Layout responsivo (desktop-first, mobile usabile).

### Componenti shadcn/ui da usare
- `Card` — contenitore sezioni
- `Button` — azioni primarie/secondarie
- `Input`, `Select`, `RadioGroup` — form
- `Badge` — stati job
- `Progress` — barre progresso
- `Dialog` — conferme (elimina job)
- `Tabs` — filtri job list
- `Skeleton` — loading states
- `Toast` — notifiche (job avviato, errore, completato)
- `DropdownMenu` — azioni job

---

## 13. Fasi di implementazione

### Fase 1 — Scaffolding, Supabase e connessione (priorita' massima)
1. `npx create-next-app` con TypeScript + Tailwind + App Router
2. Installare shadcn/ui, lucide-react, swr
3. `supabase init` + migration schema iniziale + `supabase start`
4. Installare `@supabase/supabase-js` e `@supabase/ssr`
5. Creare `lib/supabase/client.ts`, `lib/supabase/server.ts` e `lib/supabase/queries.ts`
6. Layout con sidebar e header
7. Pagina Settings con input manuale URL + token (salvati in Supabase `connections`)
8. API route proxy `/api/pod/health`
9. ConnectionBadge nel header
10. Context `ConnectionProvider` che legge la connessione attiva da Supabase

### Fase 2 — RunPod auto-discovery
1. API route `/api/pods` con client GraphQL RunPod
2. Componenti `RunPodKeyInput` e `PodSelector`
3. Health check automatico sui pod trovati
4. Salvataggio connessioni scoperte in Supabase
5. Integrazione nella pagina Settings

### Fase 3 — Upload video e metadata
1. Integrare `mediainfo.js` per estrazione metadata client-side
2. Componente `VideoDropzone` con drag & drop
3. Componente `VideoMetadata` con display info
4. Endpoint upload (`POST /upload` su api_server.py o temp file server)
5. API route proxy `/api/upload`

### Fase 4 — Pagina Upscale (form completo)
1. `ResolutionSelector` con preview risoluzione calcolata
2. `InterpolationConfig` con calcolo FPS risultante
3. `UpscaleForm` che compone tutto (default parametri letti da Supabase `preferences`)
4. Invio job tramite API route proxy
5. Salvataggio job in Supabase con metadata video e parametri
6. Redirect a dettaglio job dopo invio

### Fase 5 — Job management
1. API route proxy `/api/jobs` e `/api/jobs/[jobId]`
2. Componenti `JobCard`, `ProgressBar`, `JobStatusBadge`
3. Pagina `/jobs` con polling SWR + sync progressi su Supabase
4. Pagina `/jobs/[jobId]` con dettaglio (dati da Supabase, arricchiti dal polling remoto)
5. Azioni: elimina job (remoto + locale), download video
6. API route proxy per download (stream)
7. Storico job: la lista mostra anche job passati da Supabase (anche se il pod e' spento)

### Fase 6 — Dashboard e polish
1. Pagina Dashboard con cards riepilogo (conteggi da Supabase)
2. Toast notifications per eventi (job completato, errore)
3. Dark/light mode toggle (preferenza salvata in Supabase `preferences`)
4. Loading skeletons
5. Gestione errori e stati vuoti
6. Responsive mobile

---

## 14. Comandi di setup

```bash
# Nella root del progetto
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"
cd frontend

# shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button card input select radio-group badge progress dialog tabs skeleton toast dropdown-menu separator

# Dipendenze
npm install swr lucide-react mediainfo.js
npm install @supabase/supabase-js @supabase/ssr
npm install zod react-hook-form @hookform/resolvers
npm install -D @types/node

# Supabase locale (richiede Docker in esecuzione)
npx supabase init
# -> crea la cartella supabase/ con config.toml

# Copiare la migration 001_initial_schema.sql in supabase/migrations/
# Copiare seed.sql in supabase/

# Avviare Supabase locale
npx supabase start
# -> Stampa a schermo le chiavi e gli URL:
#    API URL:   http://localhost:54321
#    Anon Key:  eyJhbGciOiJI...
#    Dashboard: http://localhost:54323

# Generare i tipi TypeScript dallo schema
npx supabase gen types typescript --local > lib/supabase/types.ts
```

---

## 15. Variabili d'ambiente

```env
# frontend/.env.local

# Supabase locale (valori stampati da `npx supabase start`)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...  # dalla output di supabase start

# Opzionale: default per sviluppo rapido
NEXT_PUBLIC_DEFAULT_POD_URL=https://abc123-7860.proxy.runpod.net
```

---

## 16. Note implementative

### Sicurezza
- I token (RunPod API Key, Upscaler API Token) sono salvati in Supabase locale (tabella `connections`), non esposti nel codice client.
- Le API routes proxy leggono la connessione attiva da Supabase server-side. I token non transitano mai dal browser.
- Supabase locale non richiede autenticazione utente (single-user). Se in futuro si passa a Supabase cloud, attivare RLS (Row Level Security).

### Performance
- `mediainfo.js` usa WebAssembly e analizza il video localmente senza uploading. Funziona anche con file grandi perche' legge solo gli header.
- Il polling SWR si ferma automaticamente quando la tab non e' visibile.
- Il download video viene streammato (non bufferizzato in memoria) attraverso la API route proxy.
- Le query Supabase sono leggere (tabelle piccole, indici sui campi filtrati).

### Supabase locale vs cloud
- **v1 (locale):** `supabase start` avvia PostgreSQL + PostgREST in Docker. Zero costi, zero configurazione cloud.
- **Migrazione a cloud:** Cambiare `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` nel `.env.local` con i valori del progetto Supabase cloud. Pushare le migrazioni con `supabase db push`. Nessuna modifica al codice.

### Prerequisiti
- **Docker Desktop** in esecuzione (necessario per `supabase start`).
- **Node.js 18+** per Next.js.

### Limiti upload in produzione (Vercel)

Le Vercel Serverless Functions hanno un body limit di **4.5 MB** (piano Free/Pro). Per video grandi:
- **Soluzione 1:** Upload diretto dal browser al pod (bypassando Vercel), possibile se il pod espone CORS appropriato.
- **Soluzione 2:** Usare Vercel Edge Functions (body limit 4 MB ma con streaming).
- **Soluzione 3:** Upload su cloud storage (Opzione B) con presigned URL generato da una API route leggera.
- **In sviluppo locale:** Nessun limite — Next.js dev server gestisce file di qualsiasi dimensione.

### Estensibilita' futura
- **Workflow multipli:** Aggiungere tabella `workflows` in Supabase per salvare workflow custom con metadata.
- **Batch processing:** Caricare piu' video e accodarli tutti con gli stessi parametri, tracciati come gruppo in Supabase.
- **Multi-utente:** Attivare Supabase Auth + RLS per separare i dati per utente.
- **Statistiche:** Query aggregate su Supabase per tempo medio elaborazione, risoluzioni piu' usate, etc.
- **Notifiche browser:** Usare Notification API per avvisare quando un job completa (utile se l'utente sta su un'altra tab).
- **Stima tempo rimanente:** Calcolare ETA basandosi sul tempo medio di elaborazione per risoluzione dallo storico job in Supabase.
- **Anteprima video:** Generare thumbnail dal primo frame del video prima dell'upload con `<canvas>` + `<video>`.
- **WebSocket live updates:** Sostituire il polling SWR con una connessione WebSocket al pod per aggiornamenti istantanei del progresso (richiede modifica `api_server.py` per esporre un endpoint WS).

---

## 17. Deploy in produzione — Vercel + Supabase Cloud

Questa sezione descrive tutti i passi per portare l'app da locale a produzione.
L'architettura in produzione:

```
Browser (https://upscaler.tuodominio.com)
    |
    v
Vercel (Next.js Edge/Serverless)
    |
    +---> Supabase Cloud (https://xxxx.supabase.co)
    |         -> PostgreSQL gestito
    |         -> PostgREST API
    |         -> Auth (opzionale, per multi-utente futuro)
    |
    +---> RunPod GraphQL API
    |
    +---> Upscaler API sul pod RunPod
```

---

### 17.1 Prerequisiti

- Account **Vercel** (https://vercel.com) — piano Free sufficiente.
- Account **Supabase** (https://supabase.com) — piano Free (500 MB DB, 1 GB transfer).
- Repository Git (GitHub/GitLab/Bitbucket) con il codice del frontend.
- **Supabase CLI** installato localmente (`npm install -g supabase`).

---

### 17.2 Setup Supabase Cloud

#### 1. Crea il progetto Supabase

1. Vai su https://supabase.com/dashboard e clicca "New Project".
2. Scegli organizzazione, nome progetto (es. `video-upscaler`), password database, regione (scegli la piu' vicina al pod RunPod, es. `eu-central-1` per pod EU).
3. Attendi 1-2 minuti la creazione.

#### 2. Annota le credenziali

Dalla dashboard del progetto, vai su **Settings > API**. Servono:

| Valore | Dove trovarlo | Uso |
|---|---|---|
| `Project URL` | Settings > API > Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon public` key | Settings > API > Project API keys | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` key | Settings > API > Project API keys | Solo per operazioni admin server-side |
| `DB password` | quello scelto alla creazione | Per connessione diretta PostgreSQL |

#### 3. Collega la CLI al progetto cloud

```bash
cd frontend

# Login Supabase CLI
npx supabase login
# -> Apre il browser per autenticare

# Collega il progetto locale a quello cloud
npx supabase link --project-ref <PROJECT_REF>
# Il PROJECT_REF e' nella URL della dashboard: https://supabase.com/dashboard/project/<PROJECT_REF>
```

#### 4. Applica le migrazioni al database cloud

```bash
# Push di tutte le migrazioni locali al database cloud
npx supabase db push

# Verifica che le tabelle siano state create
npx supabase db inspect --linked
```

#### 5. Esegui il seed (dati iniziali)

Il seed non viene pushato automaticamente. Eseguilo manualmente:

```bash
# Connessione diretta al DB cloud via psql
npx supabase db execute --linked -f supabase/seed.sql
```

Oppure dalla dashboard Supabase: **SQL Editor > New Query** e incolla il contenuto di `seed.sql`.

#### 6. Configura Row Level Security (RLS)

In produzione, RLS deve essere attivo. Per un'app single-user senza autenticazione, la policy piu' semplice e' consentire tutto tramite `anon` key (equivalente al comportamento locale). **Questo e' accettabile solo se l'app non e' esposta pubblicamente senza protezione.**

```sql
-- Eseguire in SQL Editor sulla dashboard Supabase cloud

-- Abilita RLS su tutte le tabelle
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;

-- Policy: consenti tutto alla anon key (single-user, nessuna auth)
-- NOTA: se in futuro attivi Supabase Auth, sostituisci queste policy
--       con policy basate su auth.uid()

CREATE POLICY "anon_full_access" ON connections
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "anon_full_access" ON jobs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "anon_full_access" ON preferences
  FOR ALL USING (true) WITH CHECK (true);
```

Salva queste policy anche come migration per versionarle:

```bash
# Crea una nuova migration per le RLS policies
npx supabase migration new add_rls_policies
# -> Crea un file in supabase/migrations/XXXX_add_rls_policies.sql
# Incolla le query RLS sopra nel file, poi:
npx supabase db push
```

#### 7. Rigenera i tipi TypeScript

```bash
# Genera i tipi dal database cloud (invece che locale)
npx supabase gen types typescript --linked > lib/supabase/types.ts
```

---

### 17.3 Setup Vercel

#### 1. Importa il repository

1. Vai su https://vercel.com/dashboard e clicca "Add New > Project".
2. Importa il repository Git che contiene la cartella `frontend/`.
3. Se il frontend e' in una sottocartella del repo:
   - **Framework Preset**: Next.js (auto-rilevato)
   - **Root Directory**: `frontend` (clicca "Edit" e inserisci il path)

#### 2. Configura le variabili d'ambiente

In Vercel, vai su **Settings > Environment Variables** e aggiungi:

| Variabile | Valore | Environment |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJI...` (anon key) | Production, Preview, Development |

**NON** aggiungere la `service_role` key nelle variabili `NEXT_PUBLIC_*` — verrebbe esposta al browser.

Se in futuro servono operazioni admin server-side (nelle API routes):

| Variabile | Valore | Environment |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJI...` (service role) | Production, Preview, Development |

#### 3. Deploy

```bash
# Se hai Vercel CLI installato:
cd frontend
npx vercel --prod

# Oppure fai semplicemente push su Git:
git push origin main
# Vercel rileva automaticamente il push e fa il deploy.
```

#### 4. Verifica

1. Apri l'URL di Vercel (es. `https://video-upscaler-xxx.vercel.app`).
2. Vai su `/settings` e verifica che la connessione a Supabase funzioni (i dati seed dovrebbero essere presenti).
3. Configura un pod e testa l'upscale.

---

### 17.4 Dominio custom (opzionale)

#### Su Vercel
1. **Settings > Domains > Add** e inserisci `upscaler.tuodominio.com`.
2. Vercel mostra i record DNS da configurare (CNAME o A record).
3. Configura i DNS nel tuo provider (Cloudflare, Namecheap, etc.).
4. SSL viene generato automaticamente da Vercel.

#### Su Supabase
Non serve dominio custom per Supabase — l'URL `xxxx.supabase.co` resta invariato. E' usato solo server-side dalle API routes e client-side dal JS client (comunicazione diretta browser-Supabase e' sicura tramite anon key + RLS).

---

### 17.5 Variabili d'ambiente — riepilogo completo

```env
# ============================================
# SVILUPPO LOCALE — frontend/.env.local
# ============================================

# Supabase locale (da `npx supabase start`)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...local...

# Opzionale: default per sviluppo rapido
NEXT_PUBLIC_DEFAULT_POD_URL=https://abc123-7860.proxy.runpod.net
```

```env
# ============================================
# PRODUZIONE — Vercel Environment Variables
# ============================================

# Supabase cloud (da dashboard Supabase > Settings > API)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...cloud...

# Solo se servono operazioni admin nelle API routes (NON mettere in NEXT_PUBLIC_*)
# SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...service...
```

**Il codice applicativo non cambia.** L'unica differenza tra locale e produzione sono queste due variabili.

---

### 17.6 Migrazione locale -> produzione — Checklist

Checklist completa per passare da sviluppo locale a produzione:

```
PRE-DEPLOY
  [ ] Supabase Cloud: progetto creato, credenziali annotate
  [ ] Supabase CLI: progetto linkato (`supabase link`)
  [ ] Migrazioni pushate (`supabase db push`)
  [ ] Seed eseguito sul database cloud
  [ ] RLS attivato e policy create
  [ ] Tipi TypeScript rigenerati da cloud (`supabase gen types`)
  [ ] Build locale funzionante (`npm run build` senza errori)

VERCEL
  [ ] Repository importato in Vercel
  [ ] Root directory configurata (se sottocartella)
  [ ] Variabili d'ambiente impostate (SUPABASE_URL + ANON_KEY)
  [ ] Primo deploy completato con successo
  [ ] App raggiungibile sull'URL Vercel

POST-DEPLOY
  [ ] Pagina /settings funzionante (connessione pod configurabile)
  [ ] Health check pod OK
  [ ] Test invio job di upscale
  [ ] Test polling progresso
  [ ] Test download video completato
  [ ] Test lista job (storico da Supabase)
  [ ] Dominio custom configurato (opzionale)
```

---

### 17.7 Gestione migrazioni in produzione

Quando si modifica lo schema del database:

```bash
# 1. Crea una nuova migration in locale
npx supabase migration new nome_descrittivo
# -> Crea supabase/migrations/XXXX_nome_descrittivo.sql

# 2. Scrivi le query SQL nel file creato

# 3. Testa in locale
npx supabase db reset    # riapplica tutte le migrazioni + seed
npm run dev              # verifica che l'app funzioni

# 4. Rigenera i tipi
npx supabase gen types typescript --local > lib/supabase/types.ts

# 5. Commit e push
git add -A
git commit -m "Aggiunge migration: nome_descrittivo"
git push origin main     # Vercel fa auto-deploy

# 6. Applica la migration al database cloud
npx supabase db push

# 7. Rigenera i tipi da cloud (verifica allineamento)
npx supabase gen types typescript --linked > lib/supabase/types.ts
```

**Ordine importante:** Prima fai deploy del codice su Vercel (il nuovo codice deve gestire sia il vecchio che il nuovo schema), poi applica la migration al DB cloud. Questo evita downtime.

---

### 17.8 Costi stimati (piano Free)

| Servizio | Piano | Limiti | Costo |
|---|---|---|---|
| **Vercel** | Hobby | 100 GB bandwidth/mese, serverless | Gratis |
| **Supabase** | Free | 500 MB DB, 1 GB transfer, 50K auth users | Gratis |
| **RunPod** | Pay-per-use | Solo quando il pod e' acceso | Variabile |

Per un utilizzo tipico (singolo utente, qualche video al giorno), i piani Free sono piu' che sufficienti. Il costo principale resta RunPod per il compute GPU.

---

### 17.9 Sicurezza in produzione

**Esposizione anon key:** La `NEXT_PUBLIC_SUPABASE_ANON_KEY` e' visibile nel browser. Questo e' inteso da Supabase: la sicurezza e' garantita da RLS, non dal segreto della chiave. Le policy RLS definiscono cosa ogni chiave puo' fare.

**Token sensibili:** I token RunPod API Key e Upscaler API Token sono salvati nella tabella `connections` in Supabase. Con le policy RLS attuali (full access), chiunque con la anon key puo' leggerli. Per un'app single-user non esposta pubblicamente, questo e' accettabile. **ATTENZIONE:** se l'app viene esposta pubblicamente (es. su Vercel senza protezione), chiunque puo' leggere i token. In quel caso e' obbligatorio: (1) attivare Supabase Auth, (2) sostituire le policy RLS, (3) opzionalmente cifrare i token con `pgsodium` o leggere la connessione solo server-side tramite `SUPABASE_SERVICE_ROLE_KEY`.

**Se l'app diventa multi-utente o pubblica:**
1. Attivare **Supabase Auth** (email/password o OAuth).
2. Aggiungere colonna `user_id UUID REFERENCES auth.users(id)` a `connections` e `jobs`.
3. Sostituire le policy RLS:
   ```sql
   -- Esempio: ogni utente vede solo i propri dati
   CREATE POLICY "user_own_data" ON connections
     FOR ALL USING (auth.uid() = user_id)
     WITH CHECK (auth.uid() = user_id);
   ```
4. Cifrare i token sensibili (RunPod API Key, API Token) con `pgsodium` o a livello applicativo prima di salvarli.

**Headers di sicurezza:** Vercel aggiunge automaticamente headers di sicurezza (HSTS, X-Frame-Options, etc.). Per configurazioni avanzate, usare `next.config.mjs`:

```javascript
// next.config.mjs
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

export default {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
```
