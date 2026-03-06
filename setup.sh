#!/bin/bash
# ============================================================
# setup.sh — RunPod Pod Startup Script
# Repo: https://github.com/traliccioelettrico-wq/upscale_runpod_comfyui
#
# Da inserire in: RunPod → Edit Pod → Container Start Command
#   bash /workspace/setup.sh > /workspace/setup.log 2>&1 &
#
# Environment Variables da impostare nel pod:
#   HF_TOKEN      = hf_xxxxxxxxxxxx  (HuggingFace token)
#   API_TOKEN     = xxxxxxxxxxxx     (token API server upscaler)
#   GITHUB_TOKEN  = ghp_xxxxxxxxxxxx (opzionale, solo per repo privati)
# ============================================================

set -e

REPO_URL="https://github.com/traliccioelettrico-wq/upscale_runpod_comfyui"
UPSCALER_DIR="/workspace/upscaler"
COMFYUI_DIR="/workspace/runpod-slim/ComfyUI"
COMFYUI_LOG="/workspace/comfyui.log"
SETUP_LOG="/workspace/setup.log"
SETUP_DONE="/workspace/.setup_done"

log() { echo "[$(date '+%H:%M:%S')] $1" | tee -a "$SETUP_LOG"; }

# ── Avvia sempre ComfyUI in background ───────────────────────
start_comfyui() {
    log "Avvio ComfyUI..."
    pkill -f "main.py" 2>/dev/null || true
    sleep 2
    cd "$COMFYUI_DIR"
    nohup python3 main.py --listen 0.0.0.0 --port 8188 > "$COMFYUI_LOG" 2>&1 &
    log "ComfyUI avviato (PID $!)"
}

# ── Se il setup è già stato fatto, avvia solo ComfyUI ────────
if [ -f "$SETUP_DONE" ]; then
    log "Setup già completato — avvio ComfyUI direttamente"
    start_comfyui
    exit 0
fi

log "========================================"
log "Avvio setup upscaler RunPod"
log "========================================"

# ── 1. Clona il repo ─────────────────────────────────────────
log "Clono repo da GitHub..."
rm -rf "$UPSCALER_DIR"

if [ -n "$GITHUB_TOKEN" ]; then
    REPO_AUTH=$(echo "$REPO_URL" | sed "s|https://|https://$GITHUB_TOKEN@|")
    git clone "$REPO_AUTH" "$UPSCALER_DIR"
else
    git clone "$REPO_URL" "$UPSCALER_DIR"
fi
log "Repo clonato in $UPSCALER_DIR"

# ── 2. Crea file .env dalle environment variables del pod ────
log "Creo file .env..."
cat > "$UPSCALER_DIR/.env" << EOF
HF_TOKEN=${HF_TOKEN:-}
API_TOKEN=${API_TOKEN:-}
EOF
log ".env creato"

# ── 3. Crea cartella output ───────────────────────────────────
mkdir -p /workspace/output
log "Cartella /workspace/output creata"

# ── 4. Crea venv Python ───────────────────────────────────────
log "Creo virtual environment Python..."
python3 -m venv "$UPSCALER_DIR/venv"
source "$UPSCALER_DIR/venv/bin/activate"
log "venv creato e attivato"

# ── 5. Installa dipendenze Python ────────────────────────────
log "Installo dipendenze Python..."
pip install --quiet --upgrade pip
pip install --quiet requests tqdm websocket-client fastapi uvicorn pydantic aiohttp aiofiles
log "Dipendenze Python installate"

# ── 6. Installa custom nodes e modelli ComfyUI ───────────────
log "Installo custom nodes e modelli ComfyUI..."
cd "$UPSCALER_DIR"
python3 install_workflow_dependencies.py
log "Custom nodes e modelli installati"

# ── 7. Marca setup come completato ───────────────────────────
touch "$SETUP_DONE"
log "Setup completato!"
log "========================================"

# ── 8. Avvia ComfyUI ─────────────────────────────────────────
deactivate
start_comfyui

log "Pod pronto. ComfyUI disponibile su porta 8188"
