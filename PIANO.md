# Piano di Sviluppo — ComfyUI Video Upscaler Tools

## Panoramica

Tre script Python da eseguire su RunPod con ComfyUI già installato, basati sul workflow `Video-Upscaler-RealESRGAN.json` e sul mapping `comfyui_node_model_mapping.py`.

---

## Script 1 — `install_workflow_dependencies.py`

### Scopo
Analizza il workflow JSON, rileva custom nodes e modelli mancanti, e li installa automaticamente senza sovrascrivere nulla di esistente.

### Input
- `--workflow` → path al file JSON del workflow
- `--comfyui-path` → path root di ComfyUI (default: `/workspace/ComfyUI`)
- `--dry-run` → mostra cosa farebbe senza installare nulla

### Flusso logico

```
1. Leggi workflow JSON
      ↓
2. Estrai custom nodes richiesti
   - Leggi "cnr_id" / "aux_id" da ogni nodo
   - Costruisci lista univoca di repository da installare
      ↓
3. Interroga ComfyUI Manager custom-node-list.json (GitHub, no API key)
   - Mappa cnr_id → GitHub URL
      ↓
4. Verifica cosa è già installato
   - Controlla esistenza cartelle in ComfyUI/custom_nodes/
   - Se esiste già → skip (no sovrascrittura)
      ↓
5. Installa custom nodes mancanti
   - git clone nella cartella custom_nodes/
   - pip install -r requirements.txt se presente
      ↓
6. Estrai modelli richiesti
   - Usa NODE_TO_MODEL_FOLDER dal mapping
   - Leggi filename da widgets_values
      ↓
7. Verifica modelli già presenti
   - Controlla esistenza file in models/<cartella>/
   - Se esiste → skip
      ↓
8. Scarica modelli mancanti
   - Strategia fallback per URL:
     a. Database interno (modelli comuni noti)
     b. HuggingFace API search
     c. OpenModelDB API search
     d. Se non trovato → avvisa utente con messaggio chiaro
   - Download con progress bar (tqdm)
   - Salva nella cartella corretta
      ↓
9. Report finale
   - Lista cosa è stato installato
   - Lista cosa era già presente (skippato)
   - Lista cosa non è stato trovato (azione manuale richiesta)
```

### Dipendenze Python
- `requests` — HTTP calls
- `tqdm` — progress bar download
- `subprocess` — git clone, pip install
- `pathlib` — gestione path

### Output
- Log colorato su terminale (verde = ok, giallo = skip, rosso = errore)
- File `install_report.json` con riepilogo completo

---

## Script 2 — `run_upscale.py`

### Scopo
Invia il workflow a ComfyUI via API REST + WebSocket, mostrando i progressi in tempo reale, con parametri configurabili da CLI.

### Input (argomenti CLI)
- `--video` → path video di input (obbligatorio)
- `--output` → path/cartella dove salvare il video finale (obbligatorio)
- `--target-height` → risoluzione target in pixel di altezza (default: 1080, opzioni: 720, 1080, 1440, 2160)
- `--interpolate` → flag per attivare interpolazione RIFE (default: off)
- `--fps-multiplier` → moltiplicatore FPS per RIFE (default: 2, opzioni: 2, 3, 4)
- `--comfyui-url` → URL di ComfyUI (default: `http://127.0.0.1:8188`)
- `--workflow` → path al JSON del workflow (default: `Video-Upscaler-RealESRGAN.json`)

### Flusso logico

```
1. Valida argomenti
   - Verifica che il video esista
   - Verifica che ComfyUI sia raggiungibile (GET /system_stats)
      ↓
2. Carica il workflow JSON
      ↓
3. Modifica il workflow in memoria con i parametri CLI
   - Imposta path video nel nodo VHS_LoadVideo
   - Imposta target height nel nodo "Target Resolution"
   - Attiva/disattiva nodi interpolazione (mode=0 o mode=4)
   - Imposta fps multiplier nel nodo "FPS Multiplier"
      ↓
4. Copia il video nella cartella ComfyUI/input/
      ↓
5. Invia il workflow a ComfyUI
   - POST /prompt con il workflow modificato
   - Ricevi prompt_id
      ↓
6. Connessione WebSocket ws://host:8188/ws
   - Ascolta eventi in tempo reale:
     * "execution_start" → inizio
     * "progress" → aggiorna progress bar (value/max)
     * "executing" → mostra nodo corrente in esecuzione
     * "execution_complete" → fine
     * "execution_error" → errore con messaggio
      ↓
7. Progress bar su terminale
   - Mostra: [=====>    ] 45% | Frame 23/51 | Nodo: ImageUpscaleWithModel
      ↓
8. Al completamento
   - GET /history/{prompt_id} per ottenere il path del file output
   - Copia il file nella destinazione specificata con --output
   - Mostra path finale e durata totale
```

### Dipendenze Python
- `requests` — REST API calls
- `websocket-client` — WebSocket per progressi real-time
- `tqdm` — progress bar
- `shutil` — copia file output
- `argparse` — CLI arguments

### Output terminale (esempio)
```
✅ ComfyUI raggiungibile su http://127.0.0.1:8188
📹 Video caricato: my_video.mp4 (720x1280, 24fps, 61 frames)
🚀 Workflow inviato | Job ID: a3f2c1d4...

[Upscaling]    [████████████░░░░░░░░] 60% | Frame 37/61 | ImageUpscaleWithModel
[Interpolation] In attesa...

✅ Completato in 4m 32s
💾 Output salvato in: /home/user/output/Upscaled_00001.mp4
```

---

## Script 3 — `api_server.py`

### Scopo
Espone un endpoint HTTP sicuro (con token Bearer) che accetta richieste di upscaling dall'esterno, delegando l'elaborazione a ComfyUI tramite la stessa logica dello Script 2.

### Tecnologia
`FastAPI` + `uvicorn` — leggero, async, con docs automatiche su `/docs`

### Sicurezza
- **Bearer Token** — token statico configurato via variabile d'ambiente `API_TOKEN`
- **HTTPS** — tramite tunnel ngrok o certificato SSL (istruzioni nel README)
- **Rate limiting** — max N richieste concurrent (configurabile)
- **Input validation** — Pydantic models per tutti i parametri

### Endpoint

#### `POST /upscale`
Avvia un job di upscaling.

**Header richiesto:**
```
Authorization: Bearer <API_TOKEN>
```

**Body JSON:**
```json
{
  "video_url": "https://...",         // URL pubblico del video (alternativa a upload)
  "target_height": 2160,              // 720 | 1080 | 1440 | 2160
  "interpolate": false,               // true | false
  "fps_multiplier": 2,                // 2 | 3 | 4
  "output_filename": "mio_video"      // nome file output (opzionale)
}
```

**Response:**
```json
{
  "job_id": "a3f2c1d4-...",
  "status": "queued",
  "message": "Job avviato con successo"
}
```

#### `GET /status/{job_id}`
Controlla lo stato di un job.

**Response:**
```json
{
  "job_id": "a3f2c1d4-...",
  "status": "processing",             // queued | processing | completed | error
  "progress": 45,                     // percentuale 0-100
  "current_node": "ImageUpscaleWithModel",
  "elapsed_seconds": 127
}
```

#### `GET /download/{job_id}`
Scarica il video output quando lo status è `completed`.

**Response:** file MP4 in streaming

#### `GET /health`
Health check senza autenticazione.

**Response:**
```json
{
  "status": "ok",
  "comfyui": "reachable",
  "queue_size": 0
}
```

### Flusso logico

```
1. Avvio server con uvicorn sulla porta 7860
      ↓
2. Richiesta POST /upscale
   - Verifica Bearer token
   - Valida parametri con Pydantic
   - Scarica video da video_url nella ComfyUI/input/
   - Genera job_id univoco (UUID)
   - Salva job in dizionario in memoria con status "queued"
   - Avvia elaborazione in background (asyncio background task)
   - Ritorna job_id immediatamente
      ↓
3. Background task
   - Stessa logica di run_upscale.py
   - Aggiorna status job in memoria durante elaborazione
   - Al completamento: salva path output, status = "completed"
      ↓
4. Client polling GET /status/{job_id}
   - Ritorna progress aggiornato in tempo reale
      ↓
5. Client GET /download/{job_id}
   - Verifica status = "completed"
   - Streaming del file MP4
```

### Variabili d'ambiente
```bash
API_TOKEN=mio_token_segreto_qui       # obbligatorio
COMFYUI_URL=http://127.0.0.1:8188     # default
COMFYUI_PATH=/workspace/ComfyUI       # default
MAX_CONCURRENT_JOBS=2                  # default
PORT=7860                              # default
```

### Avvio
```bash
export API_TOKEN="mio_token_segreto"
python api_server.py
# Server in ascolto su http://0.0.0.0:7860
# Docs disponibili su http://0.0.0.0:7860/docs
```

### Esposizione esterna su RunPod
RunPod espone automaticamente le porte configurate nel pod.
Dalla dashboard RunPod → Connect → HTTP Service → porta 7860
L'URL pubblico sarà tipo: `https://<pod-id>-7860.proxy.runpod.net`

---

## Dipendenze globali da installare

```bash
pip install requests tqdm websocket-client fastapi uvicorn pydantic aiohttp aiofiles
```

---

## File prodotti

| File | Descrizione |
|---|---|
| `install_workflow_dependencies.py` | Script 1 — installazione modelli e nodi |
| `run_upscale.py` | Script 2 — esecuzione upscaling da CLI |
| `api_server.py` | Script 3 — server API con autenticazione |
| `comfyui_node_model_mapping.py` | Mapping nodi → cartelle (già esistente) |
| `install_report.json` | Generato da Script 1 — report installazione |

---

## Note importanti

- Gli script 2 e 3 **non modificano** il workflow JSON su disco — le modifiche ai parametri avvengono solo in memoria prima dell'invio a ComfyUI
- Lo script 1 **non sovrascrive mai** file o cartelle già esistenti
- Lo script 3 gestisce la coda in memoria — al riavvio del server i job vengono persi (sufficiente per uso su RunPod)
- Tutti gli script assumono ComfyUI già avviato e raggiungibile
