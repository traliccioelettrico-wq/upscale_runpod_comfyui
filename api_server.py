#!/usr/bin/env python3
"""
api_server.py
-------------
Server FastAPI che espone endpoint sicuri (Bearer Token) per controllare
il workflow di upscaling da remoto, senza accedere direttamente a ComfyUI.

Avvio:
    export API_TOKEN="mio_token_segreto"
    python api_server.py

Avvio con parametri:
    API_TOKEN="token" COMFYUI_URL="http://127.0.0.1:8188" PORT=7860 python api_server.py

Docs interattive (Swagger):
    http://<pod-id>-7860.proxy.runpod.net/docs

Esempio chiamata:
    curl -X POST https://<pod-id>-7860.proxy.runpod.net/upscale \\
         -H "Authorization: Bearer mio_token_segreto" \\
         -H "Content-Type: application/json" \\
         -d '{"video_url": "https://...", "target_height": 2160, "interpolate": false}'
"""

import asyncio
import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Optional

import aiofiles
import aiohttp
import requests
import websocket
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, validator
import uvicorn

# Auto-detection ComfyUI path + caricamento .env
try:
    from comfyui_detect import find_comfyui_path, find_workflow_path as _find_wf, load_env
    load_env(__file__)  # Carica .env prima di leggere os.environ
    _auto_comfyui = str(find_comfyui_path())
    _auto_workflow = str(_find_wf(Path(__file__).parent) or "Video-Upscaler-RealESRGAN.json")
except Exception:
    _auto_comfyui  = "/workspace/ComfyUI"
    _auto_workflow = "Video-Upscaler-RealESRGAN.json"

# ─────────────────────────────────────────────
# Configurazione da variabili d'ambiente
# ─────────────────────────────────────────────
API_TOKEN       = os.environ.get("API_TOKEN", "")
COMFYUI_URL     = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
COMFYUI_PATH    = os.environ.get("COMFYUI_PATH", _auto_comfyui)
WORKFLOW_PATH   = os.environ.get("WORKFLOW_PATH", _auto_workflow)
MAX_CONCURRENT  = int(os.environ.get("MAX_CONCURRENT_JOBS", "2"))
PORT            = int(os.environ.get("PORT", "7860"))

if not API_TOKEN:
    print("❌ ERRORE: variabile d'ambiente API_TOKEN non impostata.")
    print("   Esempio: export API_TOKEN='mio_token_segreto_lungo_e_casuale'")
    exit(1)

# ─────────────────────────────────────────────
# Job store in memoria
# ─────────────────────────────────────────────
jobs: dict[str, dict] = {}
semaphore = asyncio.Semaphore(MAX_CONCURRENT)

# ─────────────────────────────────────────────
# App FastAPI
# ─────────────────────────────────────────────
app = FastAPI(
    title="ComfyUI Video Upscaler API",
    description="""
API per upscaling video tramite ComfyUI con RealESRGAN + RIFE interpolation.

## Autenticazione
Tutte le richieste (tranne `/health`) richiedono un header:
```
Authorization: Bearer <API_TOKEN>
```

## Flusso tipico
1. `POST /upscale` → ottieni `job_id`
2. `GET /status/{job_id}` → polling fino a `status: completed`
3. `GET /download/{job_id}` → scarica il video
""",
    version="1.0.0",
)

security = HTTPBearer()


# ─────────────────────────────────────────────
# Auth dependency
# ─────────────────────────────────────────────
def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials.credentials != API_TOKEN:
        raise HTTPException(
            status_code=401,
            detail="Token non valido",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


# ─────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────
class UpscaleRequest(BaseModel):
    video_url: str = Field(
        ...,
        description="URL pubblico del video da scaricare e processare",
        example="https://example.com/mio_video.mp4"
    )
    target_height: int = Field(
        default=1080,
        description="Altezza target in pixel",
        example=2160
    )
    interpolate: bool = Field(
        default=False,
        description="Attiva frame interpolation RIFE"
    )
    fps_multiplier: int = Field(
        default=2,
        description="Moltiplicatore FPS per RIFE (2, 3 o 4)",
        example=2
    )
    output_filename: Optional[str] = Field(
        default=None,
        description="Nome file output (senza estensione). Se omesso, usa il nome originale.",
        example="mio_video_4k"
    )

    @validator("target_height")
    def validate_height(cls, v):
        if v not in (720, 1080, 1440, 2160):
            raise ValueError("target_height deve essere 720, 1080, 1440 o 2160")
        return v

    @validator("fps_multiplier")
    def validate_fps(cls, v):
        if v not in (2, 3, 4):
            raise ValueError("fps_multiplier deve essere 2, 3 o 4")
        return v


class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: int
    current_node: Optional[str]
    elapsed_seconds: int
    message: Optional[str]
    output_filename: Optional[str]


# ─────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────
def patch_workflow(workflow: dict, video_filename: str, target_height: int,
                   interpolate: bool, fps_multiplier: int) -> dict:
    import copy
    wf = copy.deepcopy(workflow)
    for node in wf.get("nodes", []):
        ntype = node.get("type", "")
        nid   = node.get("id")

        if ntype == "VHS_LoadVideo":
            wv = node.get("widgets_values", {})
            if isinstance(wv, dict):
                wv["video"] = video_filename
                node["widgets_values"] = wv
            elif isinstance(wv, list) and wv:
                wv[0] = video_filename

        if ntype == "easy mathFloat" and node.get("title") == "Target Resolution":
            wv = node.get("widgets_values", [])
            if isinstance(wv, list) and len(wv) >= 1:
                wv[0] = float(target_height)
                node["widgets_values"] = wv

        if ntype == "easy int" and node.get("title") == "FPS Multiplier":
            node["widgets_values"] = [fps_multiplier]

        INTERPOLATION_NODE_IDS = {41, 42, 43, 44, 46, 47}
        if nid in INTERPOLATION_NODE_IDS:
            node["mode"] = 0 if interpolate else 4

    return wf


async def download_video_from_url(url: str, dest_folder: Path, filename: str) -> Path:
    """Scarica un video da URL in modo asincrono."""
    dest = dest_folder / filename
    if dest.exists():
        return dest
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=400, detail=f"Impossibile scaricare il video da: {url}")
            async with aiofiles.open(dest, "wb") as f:
                async for chunk in resp.content.iter_chunked(8192):
                    await f.write(chunk)
    return dest


def queue_prompt_sync(workflow: dict) -> tuple[str, str]:
    client_id = str(uuid.uuid4())
    payload = {"prompt": workflow, "client_id": client_id}
    resp = requests.post(f"{COMFYUI_URL}/prompt", json=payload, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    return data["prompt_id"], client_id


def find_output_video(history: dict, prompt_id: str) -> str | None:
    job = history.get(prompt_id, {})
    for node_id, node_out in job.get("outputs", {}).items():
        for key in ("gifs", "videos", "images"):
            for f in node_out.get(key, []):
                fname = f.get("filename", "")
                if fname.endswith(".mp4"):
                    subfolder = f.get("subfolder", "")
                    return (subfolder + "/" + fname).lstrip("/")
    return None


# ─────────────────────────────────────────────
# Background task: elaborazione job
# ─────────────────────────────────────────────
def process_job_sync(job_id: str, workflow: dict, video_filename: str,
                     output_filename: Optional[str]):
    """Esegue il job in modo sincrono (chiamato in thread separato)."""
    jobs[job_id]["status"] = "processing"
    jobs[job_id]["started_at"] = time.time()

    try:
        # Invia workflow
        prompt_id, client_id = queue_prompt_sync(workflow)
        jobs[job_id]["prompt_id"] = prompt_id

        # WebSocket listener
        ws_url = COMFYUI_URL.replace("http://", "ws://").replace("https://", "wss://")
        ws_url = f"{ws_url}/ws?clientId={client_id}"

        completed = False
        error_msg = None

        def on_message(ws, message):
            nonlocal completed, error_msg
            try:
                data = json.loads(message)
            except Exception:
                return

            msg_type = data.get("type", "")
            d = data.get("data", {})

            if d.get("prompt_id") and d["prompt_id"] != prompt_id:
                return

            if msg_type == "progress":
                value = d.get("value", 0)
                maximum = max(d.get("max", 1), 1)
                jobs[job_id]["progress"] = int((value / maximum) * 100)
                jobs[job_id]["current_node"] = d.get("node", "")

            elif msg_type == "executing":
                node_id = d.get("node")
                if node_id:
                    jobs[job_id]["current_node"] = node_id
                else:
                    jobs[job_id]["progress"] = 100
                    completed = True
                    ws.close()

            elif msg_type == "execution_error":
                error_msg = d.get("exception_message", "Errore sconosciuto")
                ws.close()

            elif msg_type == "execution_complete":
                jobs[job_id]["progress"] = 100
                completed = True
                ws.close()

        def on_error(ws, error):
            nonlocal error_msg
            error_msg = str(error)

        ws_app = websocket.WebSocketApp(
            ws_url,
            on_message=on_message,
            on_error=on_error,
        )
        ws_app.run_forever()

        if error_msg:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["message"] = error_msg
            return

        if not completed:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["message"] = "Job terminato senza conferma di completamento"
            return

        # Recupera output
        time.sleep(1)
        history = requests.get(f"{COMFYUI_URL}/history/{prompt_id}", timeout=10).json()
        output_rel = find_output_video(history, prompt_id)

        if not output_rel:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["message"] = "Video output non trovato nella history"
            return

        # Rinomina se richiesto
        src = Path(COMFYUI_PATH) / "output" / output_rel
        if output_filename:
            final_name = output_filename + ".mp4"
            final_path = src.parent / final_name
            shutil.copy2(src, final_path)
        else:
            final_path = src

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["output_path"] = str(final_path)
        jobs[job_id]["output_filename"] = final_path.name

    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["message"] = str(e)


async def run_job(job_id: str, workflow: dict, video_filename: str,
                  output_filename: Optional[str]):
    """Wrapper asincrono che esegue il job in un thread."""
    async with semaphore:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            process_job_sync,
            job_id, workflow, video_filename, output_filename
        )


# ═══════════════════════════════════════════════════════════
# ENDPOINT
# ═══════════════════════════════════════════════════════════

@app.get("/health", tags=["Sistema"])
async def health():
    """Health check — non richiede autenticazione."""
    comfyui_ok = False
    queue_size = 0
    try:
        resp = requests.get(f"{COMFYUI_URL}/system_stats", timeout=3)
        comfyui_ok = resp.status_code == 200
        q = requests.get(f"{COMFYUI_URL}/queue", timeout=3).json()
        queue_size = len(q.get("queue_running", [])) + len(q.get("queue_pending", []))
    except Exception:
        pass

    active_jobs = sum(1 for j in jobs.values() if j["status"] == "processing")

    return {
        "status": "ok",
        "comfyui": "reachable" if comfyui_ok else "unreachable",
        "comfyui_url": COMFYUI_URL,
        "queue_size": queue_size,
        "active_jobs": active_jobs,
        "max_concurrent_jobs": MAX_CONCURRENT,
    }


@app.post("/upscale", tags=["Upscaling"])
async def upscale(
    request: UpscaleRequest,
    background_tasks: BackgroundTasks,
    token: str = Depends(verify_token),
):
    """
    Avvia un job di upscaling video.

    Ritorna immediatamente con un `job_id`.
    Usa `GET /status/{job_id}` per monitorare i progressi.
    """
    # Verifica ComfyUI
    try:
        resp = requests.get(f"{COMFYUI_URL}/system_stats", timeout=3)
        if resp.status_code != 200:
            raise Exception()
    except Exception:
        raise HTTPException(status_code=503, detail="ComfyUI non raggiungibile")

    # Verifica workflow
    workflow_path = Path(WORKFLOW_PATH)
    if not workflow_path.exists():
        raise HTTPException(status_code=500, detail=f"Workflow non trovato: {WORKFLOW_PATH}")

    # Controlla jobs concorrenti
    active = sum(1 for j in jobs.values() if j["status"] == "processing")
    if active >= MAX_CONCURRENT:
        raise HTTPException(
            status_code=429,
            detail=f"Troppi job attivi ({active}/{MAX_CONCURRENT}). Riprova più tardi."
        )

    job_id = str(uuid.uuid4())

    # Scarica video
    input_dir = Path(COMFYUI_PATH) / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    video_url = request.video_url
    video_filename = video_url.split("/")[-1].split("?")[0] or f"input_{job_id}.mp4"
    if not video_filename.endswith(".mp4"):
        video_filename += ".mp4"

    try:
        await download_video_from_url(video_url, input_dir, video_filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore download video: {e}")

    # Carica e patcha workflow
    with open(workflow_path) as f:
        workflow = json.load(f)

    patched = patch_workflow(
        workflow,
        video_filename=video_filename,
        target_height=request.target_height,
        interpolate=request.interpolate,
        fps_multiplier=request.fps_multiplier,
    )

    # Inizializza job
    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "current_node": None,
        "created_at": time.time(),
        "started_at": None,
        "message": None,
        "output_path": None,
        "output_filename": None,
        "request": request.dict(),
    }

    # Avvia in background
    background_tasks.add_task(run_job, job_id, patched, video_filename, request.output_filename)

    target_label = {720: "HD", 1080: "Full HD", 1440: "2K", 2160: "4K"}.get(request.target_height)
    return {
        "job_id": job_id,
        "status": "queued",
        "message": f"Job avviato — Target: {target_label} | Interpolazione: {'ON ×' + str(request.fps_multiplier) if request.interpolate else 'OFF'}",
    }


@app.get("/status/{job_id}", response_model=JobStatus, tags=["Upscaling"])
async def get_status(job_id: str, token: str = Depends(verify_token)):
    """
    Controlla lo stato di un job.

    - `queued` → in attesa
    - `processing` → in elaborazione (progress 0-100)
    - `completed` → completato, pronto per il download
    - `error` → errore (vedi campo `message`)
    """
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job non trovato")

    job = jobs[job_id]
    started = job.get("started_at") or job["created_at"]
    elapsed = int(time.time() - started)

    return JobStatus(
        job_id=job_id,
        status=job["status"],
        progress=job["progress"],
        current_node=job.get("current_node"),
        elapsed_seconds=elapsed,
        message=job.get("message"),
        output_filename=job.get("output_filename"),
    )


@app.get("/download/{job_id}", tags=["Upscaling"])
async def download(job_id: str, token: str = Depends(verify_token)):
    """
    Scarica il video output di un job completato.

    Disponibile solo quando `status == completed`.
    """
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job non trovato")

    job = jobs[job_id]

    if job["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Job non ancora completato (status: {job['status']})"
        )

    output_path = Path(job["output_path"])
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="File output non trovato su disco")

    return FileResponse(
        path=str(output_path),
        media_type="video/mp4",
        filename=output_path.name,
    )


@app.get("/jobs", tags=["Sistema"])
async def list_jobs(token: str = Depends(verify_token)):
    """Lista tutti i job con il loro stato."""
    return [
        {
            "job_id": jid,
            "status": j["status"],
            "progress": j["progress"],
            "elapsed_seconds": int(time.time() - j["created_at"]),
            "output_filename": j.get("output_filename"),
        }
        for jid, j in jobs.items()
    ]


@app.delete("/jobs/{job_id}", tags=["Sistema"])
async def delete_job(job_id: str, token: str = Depends(verify_token)):
    """Rimuove un job dalla memoria (non cancella il file output)."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job non trovato")
    if jobs[job_id]["status"] == "processing":
        raise HTTPException(status_code=400, detail="Impossibile eliminare un job in esecuzione")
    del jobs[job_id]
    return {"message": f"Job {job_id} eliminato"}


# ═══════════════════════════════════════════════════════════
# AVVIO
# ═══════════════════════════════════════════════════════════

if __name__ == "__main__":
    print(f"\n{'═'*55}")
    print(f"  🚀 ComfyUI Video Upscaler API Server")
    print(f"{'═'*55}")
    print(f"  ComfyUI URL  : {COMFYUI_URL}")
    print(f"  ComfyUI Path : {COMFYUI_PATH}")
    print(f"  Workflow     : {WORKFLOW_PATH}")
    print(f"  Max Jobs     : {MAX_CONCURRENT}")
    print(f"  Porta        : {PORT}")
    print(f"  API Token    : {'*' * len(API_TOKEN)}")
    print(f"{'─'*55}")
    print(f"  📖 Docs: http://0.0.0.0:{PORT}/docs")
    print(f"{'═'*55}\n")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT,
        log_level="info",
    )
