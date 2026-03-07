# Test Completo Backend — upscale_runpod_comfyui
# Da incollare direttamente in Claude Code

---

Hai accesso SSH al pod RunPod tramite il tool `ssh-mcp`.
Esegui il seguente piano di test completo in autonomia, operando SOLO via SSH sul server remoto.

## Variabili di riferimento

```
UPSCALER_DIR=/workspace/upscaler
COMFYUI_DIR=/workspace/runpod-slim/ComfyUI
VENV=source /workspace/upscaler/venv/bin/activate
API_URL=http://localhost:7860
VIDEO_1=/workspace/video/test_upscaler.mp4
VIDEO_2=/workspace/video/test_upscaler_2.mp4
OUTPUT_DIR=/workspace/output
```

---

## FASE 1 — Verifica infrastruttura

### 1.1 Verifica servizi attivi
Esegui i seguenti comandi e verifica gli output:

```bash
# ComfyUI in esecuzione?
ps aux | grep main.py | grep -v grep

# API server in esecuzione?
ps aux | grep api_server.py | grep -v grep

# Porte in ascolto
ss -tlnp | grep -E '8188|7860'
```

**Atteso:** ComfyUI su 8188, api_server su 7860.
Se uno dei due non è in esecuzione, avvialo:

```bash
# Avvia ComfyUI se non attivo
cd /workspace/runpod-slim/ComfyUI
nohup python3 main.py --listen 0.0.0.0 --port 8188 > /workspace/comfyui.log 2>&1 &
sleep 15

# Avvia api_server se non attivo
source /workspace/upscaler/venv/bin/activate
cd /workspace/upscaler
nohup python3 api_server.py > /workspace/api_server.log 2>&1 &
sleep 5
```

### 1.2 Verifica ComfyUI raggiungibile
```bash
curl -s http://localhost:8188/system_stats | python3 -m json.tool
```
**Atteso:** JSON con info GPU, memoria, versione ComfyUI.

### 1.3 Verifica modelli installati
```bash
ls -lh /workspace/runpod-slim/ComfyUI/models/upscale_models/
ls -lh /workspace/runpod-slim/ComfyUI/models/rife/
```
**Atteso:**
- `upscale_models/RealESRGAN_x4plus.pth` presente
- `rife/rife47.pth` presente

Se mancano, esegui install:
```bash
source /workspace/upscaler/venv/bin/activate
cd /workspace/upscaler
python3 install_workflow_dependencies.py
```

### 1.4 Verifica custom nodes installati
```bash
ls /workspace/runpod-slim/ComfyUI/custom_nodes/
```
**Atteso:** ComfyUI-VideoHelperSuite, ComfyUI-Easy-Use, ComfyUI-Frame-Interpolation, comfyui-int-and-float

### 1.5 Verifica video di input
```bash
ls -lh /workspace/video/
ffprobe -v quiet -print_format json -show_streams /workspace/video/test_upscaler.mp4 | python3 -c "import sys,json; s=[x for x in json.load(sys.stdin)['streams'] if x['codec_type']=='video'][0]; print(f\"Video 1: {s['width']}x{s['height']} {s['r_frame_rate']} fps\")"
ffprobe -v quiet -print_format json -show_streams /workspace/video/test_upscaler_2.mp4 | python3 -c "import sys,json; s=[x for x in json.load(sys.stdin)['streams'] if x['codec_type']=='video'][0]; print(f\"Video 2: {s['width']}x{s['height']} {s['r_frame_rate']} fps\")"
```

Se la cartella /workspace/video non esiste o i file mancano:
```bash
mkdir -p /workspace/video
# Copia i video da ComfyUI/input se presenti lì
cp /workspace/runpod-slim/ComfyUI/input/test_upscaler*.mp4 /workspace/video/ 2>/dev/null || true
```

---

## FASE 2 — Test API Server (tutti gli endpoint)

### 2.1 GET /health
```bash
curl -s http://localhost:7860/health | python3 -m json.tool
```
**Atteso:**
```json
{
  "status": "ok",
  "comfyui": "reachable",
  "queue_size": 0,
  "active_jobs": 0
}
```

### 2.2 POST /upscale — senza token (deve fallire 401)
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:7860/upscale \
  -H "Content-Type: application/json" \
  -d '{"video_url":"http://example.com/test.mp4"}'
```
**Atteso:** `403` oppure `401`

### 2.3 POST /upscale — token errato (deve fallire 401)
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:7860/upscale \
  -H "Authorization: Bearer token_sbagliato" \
  -H "Content-Type: application/json" \
  -d '{"video_url":"http://example.com/test.mp4"}'
```
**Atteso:** `401`

### 2.4 Leggi API_TOKEN dal .env
```bash
API_TOKEN=$(grep API_TOKEN /workspace/upscaler/.env | cut -d= -f2)
echo "Token: $API_TOKEN"
```

### 2.5 POST /upscale — parametri non validi (deve fallire 422)
```bash
API_TOKEN=$(grep API_TOKEN /workspace/upscaler/.env | cut -d= -f2)
curl -s -w "\nHTTP: %{http_code}" \
  -X POST http://localhost:7860/upscale \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"video_url":"http://example.com/test.mp4","target_height":999}'
```
**Atteso:** `422` (valore non valido per target_height)

### 2.6 GET /status — job inesistente (deve fallire 404)
```bash
API_TOKEN=$(grep API_TOKEN /workspace/upscaler/.env | cut -d= -f2)
curl -s -w "\nHTTP: %{http_code}" \
  http://localhost:7860/status/job-id-che-non-esiste \
  -H "Authorization: Bearer $API_TOKEN"
```
**Atteso:** `404`

### 2.7 GET /download — job inesistente (deve fallire 404)
```bash
API_TOKEN=$(grep API_TOKEN /workspace/upscaler/.env | cut -d= -f2)
curl -s -w "\nHTTP: %{http_code}" \
  http://localhost:7860/download/job-id-che-non-esiste \
  -H "Authorization: Bearer $API_TOKEN"
```
**Atteso:** `404`

### 2.8 GET /jobs — lista vuota
```bash
API_TOKEN=$(grep API_TOKEN /workspace/upscaler/.env | cut -d= -f2)
curl -s http://localhost:7860/jobs \
  -H "Authorization: Bearer $API_TOKEN" | python3 -m json.tool
```
**Atteso:** `[]`

### 2.9 GET /docs — Swagger disponibile
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:7860/docs
```
**Atteso:** `200`

---

## FASE 3 — Test upscaling video via run_upscale.py

Esegui ogni test attendendo il completamento prima di procedere al successivo.
Registra durata e risoluzione output per ogni test.

### 3.1 Test A — video 1, 1080p, no interpolazione
```bash
source /workspace/upscaler/venv/bin/activate
mkdir -p /workspace/output
rm -f /workspace/upscaler/Video-Upscaler-RealESRGAN-API.json

python3 /workspace/upscaler/run_upscale.py \
  --video /workspace/video/test_upscaler.mp4 \
  --output /workspace/output/ \
  --workflow /workspace/upscaler/Video-Upscaler-RealESRGAN.json \
  --target-height 1080
```
**Atteso:** completamento senza errori, file `Upscaled_*.mp4` in `/workspace/output/`

Verifica output:
```bash
ls -lh /workspace/output/*.mp4 | tail -1
ffprobe -v quiet -print_format json -show_streams $(ls -t /workspace/output/*.mp4 | head -1) | \
  python3 -c "import sys,json; s=[x for x in json.load(sys.stdin)['streams'] if x['codec_type']=='video'][0]; print(f\"Output: {s['width']}x{s['height']}\")"
```
**Atteso:** altezza ~1080px

### 3.2 Test B — video 1, 2160p (4K), no interpolazione
```bash
python3 /workspace/upscaler/run_upscale.py \
  --video /workspace/video/test_upscaler.mp4 \
  --output /workspace/output/ \
  --workflow /workspace/upscaler/Video-Upscaler-RealESRGAN.json \
  --target-height 2160
```
**Atteso:** altezza ~2160px

### 3.3 Test C — video 2, 1440p, no interpolazione
```bash
python3 /workspace/upscaler/run_upscale.py \
  --video /workspace/video/test_upscaler_2.mp4 \
  --output /workspace/output/ \
  --workflow /workspace/upscaler/Video-Upscaler-RealESRGAN.json \
  --target-height 1440
```
**Atteso:** altezza ~1440px

### 3.4 Test D — video 1, 2160p, CON interpolazione (fps x2)
```bash
python3 /workspace/upscaler/run_upscale.py \
  --video /workspace/video/test_upscaler.mp4 \
  --output /workspace/output/ \
  --workflow /workspace/upscaler/Video-Upscaler-RealESRGAN.json \
  --target-height 2160 \
  --interpolate \
  --fps-multiplier 2
```
**Atteso:** file `Upscaled_Interpolated_*.mp4`, FPS doppio rispetto all'input

Verifica fps output:
```bash
ffprobe -v quiet -print_format json -show_streams $(ls -t /workspace/output/*Interpolated*.mp4 | head -1) | \
  python3 -c "import sys,json; s=[x for x in json.load(sys.stdin)['streams'] if x['codec_type']=='video'][0]; print(f\"FPS: {s['r_frame_rate']} | {s['width']}x{s['height']}\")"
```

### 3.5 Test E — video 2, 1080p, CON interpolazione (fps x3)
```bash
python3 /workspace/upscaler/run_upscale.py \
  --video /workspace/video/test_upscaler_2.mp4 \
  --output /workspace/output/ \
  --workflow /workspace/upscaler/Video-Upscaler-RealESRGAN.json \
  --target-height 1080 \
  --interpolate \
  --fps-multiplier 3
```

---

## FASE 4 — Test API server upscaling (job reali)

Per ogni test: avvia il job, fai polling su /status fino a completed, verifica il file output.

### 4.1 Crea script di test API
Crea il file `/workspace/upscaler/test_api.sh`:

```bash
cat > /workspace/upscaler/test_api.sh << 'SCRIPT'
#!/bin/bash
API_URL="http://localhost:7860"
API_TOKEN=$(grep API_TOKEN /workspace/upscaler/.env | cut -d= -f2)
AUTH="Authorization: Bearer $API_TOKEN"

GREEN='\033[92m'
RED='\033[91m'
CYAN='\033[96m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}✅ $1${RESET}"; }
fail() { echo -e "${RED}❌ $1${RESET}"; }
info() { echo -e "${CYAN}ℹ️  $1${RESET}"; }

# Funzione polling status
wait_job() {
  local JOB_ID=$1
  local MAX_WAIT=${2:-600}  # timeout 10 minuti default
  local ELAPSED=0
  
  while [ $ELAPSED -lt $MAX_WAIT ]; do
    STATUS=$(curl -s "$API_URL/status/$JOB_ID" -H "$AUTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status']+'|'+str(d['progress'])+'|'+(d['current_node'] or ''))" 2>/dev/null)
    JOB_STATUS=$(echo $STATUS | cut -d'|' -f1)
    PROGRESS=$(echo $STATUS | cut -d'|' -f2)
    NODE=$(echo $STATUS | cut -d'|' -f3)
    
    echo -ne "\r  Status: $JOB_STATUS | Progress: $PROGRESS% | Node: $NODE          "
    
    if [ "$JOB_STATUS" = "completed" ]; then
      echo ""
      return 0
    elif [ "$JOB_STATUS" = "error" ]; then
      echo ""
      MSG=$(curl -s "$API_URL/status/$JOB_ID" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message',''))")
      fail "Job fallito: $MSG"
      return 1
    fi
    
    sleep 3
    ELAPSED=$((ELAPSED + 3))
  done
  
  fail "Timeout dopo ${MAX_WAIT}s"
  return 1
}

# Copia video in una URL accessibile localmente via file://
# Usiamo un server HTTP temporaneo per servire i file
python3 -m http.server 9999 --directory /workspace/video > /tmp/httpserver.log 2>&1 &
HTTP_PID=$!
sleep 1
info "Server HTTP temporaneo avviato (PID $HTTP_PID) su porta 9999"

echo ""
echo "=========================================="
echo "  TEST API SERVER — upscale_runpod_comfyui"
echo "=========================================="

# ── TEST 1: Video 1, 1080p, no interpolazione ──
echo ""
info "TEST API-1: video 1 → 1080p, no interpolazione"
RESP=$(curl -s -X POST "$API_URL/upscale" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "http://localhost:9999/test_upscaler.mp4",
    "target_height": 1080,
    "interpolate": false
  }')
JOB_ID=$(echo $RESP | python3 -c "import sys,json; print(json.load(sys.stdin).get('job_id','ERROR'))")
echo "  job_id: $JOB_ID"
if [ "$JOB_ID" = "ERROR" ]; then
  fail "Avvio job fallito: $RESP"
else
  wait_job $JOB_ID && ok "TEST API-1 completato"
  FNAME=$(curl -s "$API_URL/status/$JOB_ID" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('output_filename','?'))")
  info "Output: $FNAME"
  
  # Test download
  DL_CODE=$(curl -s -o /tmp/api_test_output_1.mp4 -w "%{http_code}" \
    "$API_URL/download/$JOB_ID" -H "$AUTH")
  [ "$DL_CODE" = "200" ] && ok "Download OK (HTTP $DL_CODE)" || fail "Download fallito (HTTP $DL_CODE)"
  ls -lh /tmp/api_test_output_1.mp4 2>/dev/null
fi

# ── TEST 2: Video 2, 2160p, no interpolazione ──
echo ""
info "TEST API-2: video 2 → 2160p (4K), no interpolazione"
RESP=$(curl -s -X POST "$API_URL/upscale" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "http://localhost:9999/test_upscaler_2.mp4",
    "target_height": 2160,
    "interpolate": false
  }')
JOB_ID=$(echo $RESP | python3 -c "import sys,json; print(json.load(sys.stdin).get('job_id','ERROR'))")
echo "  job_id: $JOB_ID"
if [ "$JOB_ID" = "ERROR" ]; then
  fail "Avvio job fallito: $RESP"
else
  wait_job $JOB_ID 900 && ok "TEST API-2 completato"
  FNAME=$(curl -s "$API_URL/status/$JOB_ID" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('output_filename','?'))")
  info "Output: $FNAME"
fi

# ── TEST 3: Video 1, 1440p, CON interpolazione x2 ──
echo ""
info "TEST API-3: video 1 → 1440p + interpolazione x2"
RESP=$(curl -s -X POST "$API_URL/upscale" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "http://localhost:9999/test_upscaler.mp4",
    "target_height": 1440,
    "interpolate": true,
    "fps_multiplier": 2,
    "output_filename": "api_test_interpolated_1440"
  }')
JOB_ID=$(echo $RESP | python3 -c "import sys,json; print(json.load(sys.stdin).get('job_id','ERROR'))")
echo "  job_id: $JOB_ID"
if [ "$JOB_ID" = "ERROR" ]; then
  fail "Avvio job fallito: $RESP"
else
  wait_job $JOB_ID 900 && ok "TEST API-3 completato"
  FNAME=$(curl -s "$API_URL/status/$JOB_ID" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('output_filename','?'))")
  info "Output: $FNAME"
fi

# ── TEST 4: GET /jobs — verifica lista job ──
echo ""
info "TEST API-4: GET /jobs"
JOBS=$(curl -s "$API_URL/jobs" -H "$AUTH")
COUNT=$(echo $JOBS | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
[ "$COUNT" -ge "3" ] && ok "Lista job: $COUNT job trovati" || fail "Attesi ≥3 job, trovati $COUNT"

# ── TEST 5: DELETE job completato ──
echo ""
info "TEST API-5: DELETE job"
LAST_JOB=$(echo $JOBS | python3 -c "import sys,json; jobs=json.load(sys.stdin); completed=[j for j in jobs if j['status']=='completed']; print(completed[0]['job_id'] if completed else 'NONE')")
if [ "$LAST_JOB" != "NONE" ]; then
  DEL_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X DELETE "$API_URL/jobs/$LAST_JOB" -H "$AUTH")
  [ "$DEL_CODE" = "200" ] && ok "DELETE job: HTTP $DEL_CODE" || fail "DELETE fallito: HTTP $DEL_CODE"
else
  fail "Nessun job completato disponibile per il test DELETE"
fi

# ── Cleanup ──
kill $HTTP_PID 2>/dev/null
echo ""
echo "=========================================="
echo "  TEST COMPLETATI"
echo "=========================================="
ls -lh /workspace/output/*.mp4 2>/dev/null | tail -10

SCRIPT
chmod +x /workspace/upscaler/test_api.sh
```

### 4.2 Esegui lo script di test API
```bash
bash /workspace/upscaler/test_api.sh 2>&1 | tee /workspace/test_api.log
```

### 4.3 Verifica log in caso di errori
```bash
# Log api_server
tail -50 /workspace/api_server.log

# Log ComfyUI
tail -50 /workspace/comfyui.log
```

---

## FASE 5 — Verifica output finali

```bash
echo "=== File output generati ==="
ls -lh /workspace/output/*.mp4 2>/dev/null

echo ""
echo "=== Dettagli video output ==="
for f in /workspace/output/*.mp4; do
  INFO=$(ffprobe -v quiet -print_format json -show_streams "$f" | \
    python3 -c "import sys,json; streams=json.load(sys.stdin)['streams']; v=[s for s in streams if s['codec_type']=='video'][0]; print(f\"{v['width']}x{v['height']} @ {v['r_frame_rate']} fps\")" 2>/dev/null)
  echo "  $(basename $f): $INFO"
done

echo ""
echo "=== RAM e VRAM usate ==="
free -h
nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader 2>/dev/null || echo "GPU non NVIDIA o nvidia-smi non disponibile"
```

---

## ⛔ REGOLA FONDAMENTALE — STOP AL PRIMO ERRORE

**Ad ogni step, se qualcosa non corrisponde all'atteso:**
- Fermati immediatamente
- NON procedere allo step successivo
- NON tentare correzioni autonome
- Riporta all'utente:
  1. Quale step è fallito (es. "FASE 1 — Step 1.3")
  2. Il comando eseguito
  3. L'output ricevuto (completo, non troncato)
  4. Cosa era atteso
  5. Il contenuto dei log rilevanti (`tail -50` di comfyui.log e api_server.log se pertinenti)
- Attendi istruzioni prima di continuare

**Dopo che l'utente fornisce la correzione:**
- Applica SOLO la correzione indicata
- Riesegui SOLO lo step fallito — NON ricominciare dall'inizio
- Se lo step ora passa, prosegui con il successivo
- Se fallisce ancora, produci un nuovo report e attendi ulteriori istruzioni

Questo vale per QUALSIASI tipo di problema:
- Servizio non in esecuzione
- File o cartella mancante
- HTTP status code sbagliato
- Risoluzione output video errata
- Qualsiasi output diverso da quello atteso

**Formato report errore:**

```
⛔ STOP — Step <FASE>.<N> fallito

Comando:
  <comando eseguito>

Output ricevuto:
  <output completo>

Atteso:
  <cosa ci si aspettava>

Log rilevanti:
  <tail log se applicabile>

In attesa di istruzioni.
```

---

## OUTPUT ATTESO AL TERMINE

Al termine di tutti i test deve essere presente in `/workspace/output/`:

- `Upscaled_*.mp4` — test A (1080p, no interp)
- `Upscaled_*.mp4` — test B (2160p, no interp)
- `Upscaled_*.mp4` — test C (1440p, no interp, video 2)
- `Upscaled_Interpolated_*.mp4` — test D (2160p, interp x2)
- `Upscaled_Interpolated_*.mp4` — test E (1080p, interp x3, video 2)
- File da test API: almeno 3 job completati in `/jobs`

Tutti i file devono essere MP4 validi con la risoluzione corretta verificata da ffprobe.
