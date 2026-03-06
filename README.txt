================================================================================
  ComfyUI Video Upscaler — Guida Setup Completa (RunPod)
================================================================================

File inclusi nel progetto:
  - install_workflow_dependencies.py  → installa modelli e custom nodes
  - run_upscale.py                    → upscaling da terminale SSH
  - api_server.py                     → server API con autenticazione
  - comfyui_node_model_mapping.py     → mapping nodi → cartelle modelli
  - Video-Upscaler-RealESRGAN.json    → workflow ComfyUI

================================================================================
  STEP 1 — Installa le dipendenze Python
================================================================================

Esegui dal terminale SSH del pod:

    pip install requests tqdm websocket-client fastapi uvicorn pydantic aiohttp aiofiles

--------------------------------------------------------------------------------

================================================================================
  STEP 2 — Carica i file sul pod
================================================================================

Opzione A — Via File Manager RunPod (drag & drop):
  Dashboard RunPod → il tuo pod → File Manager
  Carica tutti i file in: /workspace/

Opzione B — Via SCP da terminale locale (sostituisci con il tuo IP/utente):

    scp -i ~/.ssh/id_rsa \
        install_workflow_dependencies.py \
        run_upscale.py \
        api_server.py \
        comfyui_node_model_mapping.py \
        Video-Upscaler-RealESRGAN.json \
        user@<POD_IP>:/workspace/

Verifica che i file siano presenti:

    ls /workspace/*.py /workspace/*.json

--------------------------------------------------------------------------------

================================================================================
  STEP 3 — Installa modelli e custom nodes
================================================================================

Prima fai un DRY-RUN per vedere cosa verrà installato senza toccare nulla:

    python /workspace/install_workflow_dependencies.py \
      --workflow /workspace/Video-Upscaler-RealESRGAN.json \
      --comfyui-path /workspace/ComfyUI \
      --dry-run

Se il risultato ti soddisfa, esegui l'installazione reale:

    python /workspace/install_workflow_dependencies.py \
      --workflow /workspace/Video-Upscaler-RealESRGAN.json \
      --comfyui-path /workspace/ComfyUI

Al termine viene generato un file install_report.json con il riepilogo
di cosa è stato installato, cosa era già presente e cosa non è stato trovato.

Se alcuni modelli non vengono trovati automaticamente, scaricali manualmente:

  Modello upscaler RealESRGAN (obbligatorio):
    wget -O /workspace/ComfyUI/models/upscale_models/RealESRGAN_x4plus.pth \
      https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth

  Modello RIFE per interpolazione (solo se usi --interpolate):
    mkdir -p /workspace/ComfyUI/models/rife
    wget -O /workspace/ComfyUI/models/rife/rife47.pth \
      https://huggingface.co/Fannovel16/custom_nodes_deps/resolve/main/rife47.pth

Dopo l'installazione dei custom nodes, RIAVVIA ComfyUI:

    pkill -f "python main.py"
    cd /workspace/ComfyUI
    python main.py --listen 0.0.0.0 --port 8188 &

--------------------------------------------------------------------------------

================================================================================
  STEP 4 — Avvia il server API
================================================================================

Imposta le variabili d'ambiente (OBBLIGATORIO: solo API_TOKEN va cambiato,
gli altri hanno già valori di default corretti per RunPod):

    export API_TOKEN="scegli_un_token_lungo_e_casuale_qui"
    export COMFYUI_URL="http://127.0.0.1:8188"
    export COMFYUI_PATH="/workspace/ComfyUI"
    export WORKFLOW_PATH="/workspace/Video-Upscaler-RealESRGAN.json"
    export MAX_CONCURRENT_JOBS=2
    export PORT=7860

Avvia il server:

    cd /workspace
    python api_server.py

Il server stamperà a schermo la configurazione e l'URL delle docs:

    ═══════════════════════════════════════════════════════
      🚀 ComfyUI Video Upscaler API Server
    ═══════════════════════════════════════════════════════
      ComfyUI URL  : http://127.0.0.1:8188
      ComfyUI Path : /workspace/ComfyUI
      Workflow     : /workspace/Video-Upscaler-RealESRGAN.json
      Max Jobs     : 2
      Porta        : 7860
      API Token    : ********************************
    ───────────────────────────────────────────────────────
      📖 Docs: http://0.0.0.0:7860/docs
    ═══════════════════════════════════════════════════════

Per tenere il server attivo anche dopo aver chiuso il terminale SSH:

    nohup python api_server.py > /workspace/api_server.log 2>&1 &
    echo "Server avviato, PID: $!"

Per vedere i log in tempo reale:

    tail -f /workspace/api_server.log

Per fermare il server:

    pkill -f "api_server.py"

Variabili d'ambiente — riferimento completo:

  API_TOKEN            (obbligatorio) Scegli una stringa lunga e casuale.
                                      Es: "xK9#mP2$qL7nR4vW8jY1"
  COMFYUI_URL          (default: http://127.0.0.1:8188)
                                      Cambia solo se ComfyUI usa porta diversa.
  COMFYUI_PATH         (default: /workspace/ComfyUI)
                                      Cambia se ComfyUI è installato altrove.
  WORKFLOW_PATH        (default: Video-Upscaler-RealESRGAN.json)
                                      Path completo al file JSON del workflow.
  MAX_CONCURRENT_JOBS  (default: 2)   Max job elaborati in parallelo.
  PORT                 (default: 7860) Porta su cui gira il server API.

--------------------------------------------------------------------------------

================================================================================
  STEP 5 — Esponi la porta su RunPod
================================================================================

1. Vai sulla Dashboard RunPod
2. Seleziona il tuo pod
3. Clicca su "Edit Pod"
4. Nella sezione "Expose HTTP Ports" aggiungi: 7860
5. Salva le modifiche

Per trovare il tuo URL pubblico:
  Dashboard RunPod → il tuo pod → Connect → HTTP Service

Il formato dell'URL sarà:
  https://<POD_ID>-7860.proxy.runpod.net

Esempio:
  https://abc123xyz-7860.proxy.runpod.net

L'HTTPS è gestito automaticamente da RunPod — non serve nessuna
configurazione SSL aggiuntiva.

La documentazione interattiva (Swagger UI) sarà disponibile su:
  https://<POD_ID>-7860.proxy.runpod.net/docs

--------------------------------------------------------------------------------

================================================================================
  STEP 6 — Usa gli endpoint API
================================================================================

Sostituisci in tutti i comandi:
  <URL>   → il tuo URL pubblico RunPod (es. https://abc123xyz-7860.proxy.runpod.net)
  <TOKEN> → il valore che hai impostato in API_TOKEN

────────────────────────────────────────────────────────────────────────────────
  6a. Health check (nessun token richiesto)
────────────────────────────────────────────────────────────────────────────────

    curl https://<URL>/health

  Risposta attesa:
    {
      "status": "ok",
      "comfyui": "reachable",
      "queue_size": 0,
      "active_jobs": 0,
      "max_concurrent_jobs": 2
    }

────────────────────────────────────────────────────────────────────────────────
  6b. Avvia un upscaling
────────────────────────────────────────────────────────────────────────────────

  Esempio base (1080p, senza interpolazione):

    curl -X POST https://<URL>/upscale \
         -H "Authorization: Bearer <TOKEN>" \
         -H "Content-Type: application/json" \
         -d '{
           "video_url": "https://example.com/mio_video.mp4",
           "target_height": 1080,
           "interpolate": false
         }'

  Esempio avanzato (4K, con interpolazione ×2 → 48fps):

    curl -X POST https://<URL>/upscale \
         -H "Authorization: Bearer <TOKEN>" \
         -H "Content-Type: application/json" \
         -d '{
           "video_url": "https://example.com/mio_video.mp4",
           "target_height": 2160,
           "interpolate": true,
           "fps_multiplier": 2,
           "output_filename": "mio_video_4k_48fps"
         }'

  Parametri disponibili:
    video_url        (obbligatorio) URL pubblico del video da processare
    target_height    720 | 1080 | 1440 | 2160  (default: 1080)
    interpolate      true | false               (default: false)
    fps_multiplier   2 | 3 | 4                 (default: 2, solo se interpolate: true)
    output_filename  nome file output senza estensione (opzionale)

  Risposta:
    {
      "job_id": "a3f2c1d4-...",
      "status": "queued",
      "message": "Job avviato — Target: Full HD | Interpolazione: OFF"
    }

  SALVA il job_id — ti serve per i prossimi comandi.

────────────────────────────────────────────────────────────────────────────────
  6c. Controlla lo stato del job
────────────────────────────────────────────────────────────────────────────────

    curl https://<URL>/status/<JOB_ID> \
         -H "Authorization: Bearer <TOKEN>"

  Risposta durante elaborazione:
    {
      "job_id": "a3f2c1d4-...",
      "status": "processing",
      "progress": 45,
      "current_node": "ImageUpscaleWithModel",
      "elapsed_seconds": 127,
      "message": null,
      "output_filename": null
    }

  Risposta quando completato:
    {
      "job_id": "a3f2c1d4-...",
      "status": "completed",
      "progress": 100,
      "current_node": null,
      "elapsed_seconds": 284,
      "message": null,
      "output_filename": "Upscaled_00001.mp4"
    }

  Valori possibili di status:
    queued      → in attesa di elaborazione
    processing  → in elaborazione (vedi progress 0-100)
    completed   → completato, pronto per il download
    error       → errore (vedi campo message per dettagli)

────────────────────────────────────────────────────────────────────────────────
  6d. Scarica il video output
────────────────────────────────────────────────────────────────────────────────

    curl -O -J https://<URL>/download/<JOB_ID> \
         -H "Authorization: Bearer <TOKEN>"

  Il file viene salvato nella cartella corrente con il nome originale.
  Disponibile solo quando status == "completed".

────────────────────────────────────────────────────────────────────────────────
  6e. Lista tutti i job
────────────────────────────────────────────────────────────────────────────────

    curl https://<URL>/jobs \
         -H "Authorization: Bearer <TOKEN>"

────────────────────────────────────────────────────────────────────────────────
  6f. Elimina un job dalla memoria
────────────────────────────────────────────────────────────────────────────────

    curl -X DELETE https://<URL>/jobs/<JOB_ID> \
         -H "Authorization: Bearer <TOKEN>"

  Nota: elimina solo il record in memoria, non il file video su disco.

--------------------------------------------------------------------------------

================================================================================
  USO DA TERMINALE SSH (alternativa all'API)
================================================================================

Se preferisci lanciare l'upscaling direttamente dal terminale SSH del pod,
senza passare dall'API, usa run_upscale.py:

  Esempio base:
    python /workspace/run_upscale.py \
      --video /workspace/ComfyUI/input/mio_video.mp4 \
      --output /workspace/output/ \
      --workflow /workspace/Video-Upscaler-RealESRGAN.json

  Esempio 4K con interpolazione:
    python /workspace/run_upscale.py \
      --video /workspace/ComfyUI/input/mio_video.mp4 \
      --output /workspace/output/ \
      --target-height 2160 \
      --interpolate \
      --fps-multiplier 2 \
      --workflow /workspace/Video-Upscaler-RealESRGAN.json

  Tutti i parametri disponibili:
    --video           (obbligatorio) Path al video di input
    --output          (obbligatorio) Cartella o path di output
    --workflow        Path al workflow JSON
    --target-height   720 | 1080 | 1440 | 2160  (default: 1080)
    --interpolate     Attiva frame interpolation RIFE
    --fps-multiplier  2 | 3 | 4  (default: 2)
    --comfyui-url     URL ComfyUI (default: http://127.0.0.1:8188)
    --comfyui-path    Path root ComfyUI (default: /workspace/ComfyUI)

--------------------------------------------------------------------------------

================================================================================
  NOTE E CONSIGLI
================================================================================

Out of Memory a 4K:
  Se vai in errore OOM durante l'upscaling a 2160p, abilita il Meta Batch
  Manager nel workflow (attualmente disabilitato) e abbassa il valore
  dei frame per batch. Riferimento orientativo per RTX 5090 (32GB VRAM):
  non dovresti avere problemi, ma in caso abbassa a 10-15 frame per batch.

Network Volume RunPod:
  Usa sempre un Network Volume montato su /workspace per preservare modelli
  e output tra una sessione e l'altra. Senza volume persistente, tutto
  viene cancellato allo spegnimento del pod.

Generare un token sicuro:
  Da terminale Python:
    python -c "import secrets; print(secrets.token_urlsafe(32))"

  Esempio output: "xK9mP2qL7nR4vW8jY1dF3sA6bC0eH5iJ"

Documentazione interattiva Swagger UI:
  Apri nel browser: https://<POD_ID>-7860.proxy.runpod.net/docs
  Puoi testare tutti gli endpoint direttamente dal browser, inclusa
  l'autenticazione con il tuo token.

================================================================================
  FILE DI PROGETTO — RIEPILOGO
================================================================================

  install_workflow_dependencies.py  → Step 3: installa modelli e nodi
  run_upscale.py                    → upscaling diretto da terminale SSH
  api_server.py                     → Step 4-6: server API remoto
  comfyui_node_model_mapping.py     → libreria condivisa di mapping
  Video-Upscaler-RealESRGAN.json    → workflow ComfyUI configurato
  PIANO.md                          → documentazione tecnica completa
  README.txt                        → questo file

================================================================================

/workspace/runpod-slim/ComfyUI
Non in /workspace/ComfyUI come assumono gli script. Devi quindi aggiornare il path in tutti i comandi.

Negli script non cambia nulla nel codice — cambia solo il parametro che passi.
Script 1 — installazione:
bashpython install_workflow_dependencies.py \
  --workflow /workspace/runpod-slim/Video-Upscaler-RealESRGAN.json \
  --comfyui-path /workspace/runpod-slim/ComfyUI
  
Script 2 — upscaling da terminale:
bashpython run_upscale.py \
  --video /workspace/runpod-slim/ComfyUI/input/mio_video.mp4 \
  --output /workspace/runpod-slim/output/ \
  --workflow /workspace/runpod-slim/Video-Upscaler-RealESRGAN.json \
  --comfyui-path /workspace/runpod-slim/ComfyUI
  
Script 3 — server API:
bashexport API_TOKEN="il_tuo_token_segreto"
export COMFYUI_URL="http://127.0.0.1:8188"
export COMFYUI_PATH="/workspace/runpod-slim/ComfyUI"
export WORKFLOW_PATH="/workspace/runpod-slim/Video-Upscaler-RealESRGAN.json"
export PORT=7860

python api_server.py