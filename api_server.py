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

Esempio chiamata video:
    curl -X POST https://<pod-id>-7860.proxy.runpod.net/upscale \\
         -H "Authorization: Bearer mio_token_segreto" \\
         -H "Content-Type: application/json" \\
         -d '{"video_url": "https://...", "target_height": 2160, "interpolate": false}'

Esempio chiamata immagine:
    curl -X POST https://<pod-id>-7860.proxy.runpod.net/upscale/image \\
         -H "Authorization: Bearer mio_token_segreto" \\
         -H "Content-Type: application/json" \\
         -d '{"image_url": "https://...", "target_height": 2160, "scale_mode": "target"}'
"""

import asyncio
import base64
import io
import json
import os
import shutil
import subprocess
import sys
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
API_TOKEN      = os.environ.get("API_TOKEN", "")
COMFYUI_URL    = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
COMFYUI_PATH   = os.environ.get("COMFYUI_PATH", _auto_comfyui)
WORKFLOW_PATH  = os.environ.get("WORKFLOW_PATH", _auto_workflow)
WORKFLOW_IMAGE_PATH = os.environ.get(
    "WORKFLOW_IMAGE_PATH",
    str(Path(_auto_workflow).parent / "Image-Upscaler-RealESRGAN.json")
)
MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT_JOBS", "2"))
PORT           = int(os.environ.get("PORT", "7860"))

if not API_TOKEN:
    print("❌ ERRORE: variabile d'ambiente API_TOKEN non impostata.")
    print("   Esempio: export API_TOKEN='mio_token_segreto_lungo_e_casuale'")
    exit(1)

# ─────────────────────────────────────────────
# Job store in memoria
# ─────────────────────────────────────────────
jobs: dict[str, dict] = {}
semaphore: asyncio.Semaphore = None

# ─────────────────────────────────────────────
# App FastAPI
# ─────────────────────────────────────────────
app = FastAPI(
    title="ComfyUI Upscaler API",
    description="""
API per upscaling video e immagini tramite ComfyUI con RealESRGAN.

## Autenticazione
Tutte le richieste (tranne `/health`) richiedono un header:
```
Authorization: Bearer <API_TOKEN>
```

## Flusso video
1. `POST /upscale` → ottieni `job_id`
2. `GET /status/{job_id}` → polling fino a `status: completed`
3. `GET /download/{job_id}` → scarica il video

## Flusso immagine
1. `POST /upscale/image` → ottieni `job_id`
2. `GET /status/{job_id}` → polling fino a `status: completed`
3. `GET /download/image/{job_id}` → scarica l'immagine PNG
""",
    version="1.1.0",
)

security = HTTPBearer()


@app.on_event("startup")
async def startup_event():
    global semaphore
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)


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


class ImageUpscaleRequest(BaseModel):
    image_url: Optional[str] = Field(
        default=None,
        description="URL pubblico dell'immagine da scaricare"
    )
    image_base64: Optional[str] = Field(
        default=None,
        description="Immagine in base64 (alternativa a image_url)"
    )
    target_height: int = Field(
        default=2160,
        description="Altezza target in pixel"
    )
    scale_mode: str = Field(
        default="target",
        description="target = scala a target_height | native = output nativo 4x ESRGAN"
    )
    output_filename: Optional[str] = Field(
        default=None,
        description="Nome file output (senza estensione)"
    )

    @validator("target_height")
    def validate_height(cls, v):
        if v not in (720, 1080, 1440, 2160, 4320):
            raise ValueError("target_height deve essere 720, 1080, 1440, 2160 o 4320")
        return v

    @validator("scale_mode")
    def validate_mode(cls, v):
        if v not in ("target", "native"):
            raise ValueError("scale_mode deve essere 'target' o 'native'")
        return v


class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: int
    current_node: Optional[str]
    elapsed_seconds: int
    message: Optional[str]
    output_filename: Optional[str]
    job_type: Optional[str]


# ─────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────
def load_api_workflow(workflow_path: Path) -> dict:
    """Carica il workflow e lo converte in formato API se necessario."""
    with open(workflow_path) as f:
        wf = json.load(f)

    # Controlla se e' gia' formato API (dizionario piatto con class_type)
    if isinstance(wf, dict) and wf and all(
        isinstance(v, dict) and "class_type" in v for v in wf.values()
    ):
        return wf

    # E' formato UI — cerca o genera la versione API
    api_path = workflow_path.with_name(workflow_path.stem + "-API.json")
    if not api_path.exists():
        converter = Path(__file__).parent / "convert_workflow.py"
        if not converter.exists():
            raise HTTPException(status_code=500, detail="convert_workflow.py non trovato")
        result = subprocess.run(
            [sys.executable, str(converter), str(workflow_path), str(api_path)],
            capture_output=True, text=True,
        )
        if result.returncode != 0 or not api_path.exists():
            raise HTTPException(
                status_code=500,
                detail=f"Errore conversione workflow: {result.stderr[:300]}",
            )

    with open(api_path) as f:
        return json.load(f)


def patch_workflow(workflow: dict, video_filename: str, target_height: int,
                   interpolate: bool, fps_multiplier: int) -> dict:
    """
    Modifica il workflow API in memoria.
    Cerca i nodi configurabili per titolo (_meta.title) e class_type.
    """
    import copy
    wf = copy.deepcopy(workflow)

    for node_id, node in wf.items():
        class_type = node.get("class_type", "")
        inputs     = node.get("inputs", {})
        meta       = node.get("_meta", {})
        title      = meta.get("title", "")

        # Video di input
        if class_type == "VHS_LoadVideo":
            inputs["video"] = video_filename

        # Target Resolution
        if title == "Target Resolution":
            for key in ("a", "value", "b"):
                if key in inputs and not isinstance(inputs[key], list):
                    inputs[key] = float(target_height)
                    break

        # FPS Multiplier
        if title == "FPS Multiplier":
            for key in ("value", "a", "b"):
                if key in inputs and not isinstance(inputs[key], list):
                    inputs[key] = fps_multiplier
                    break

        node["inputs"] = inputs

    # Gestione interpolazione
    interp_ids = {
        nid for nid, n in wf.items()
        if n.get("_meta", {}).get("in_interpolation_group")
    }

    if not interpolate:
        for nid in interp_ids:
            wf.pop(nid, None)
        for node_id, node in wf.items():
            node["inputs"] = {
                k: v for k, v in node.get("inputs", {}).items()
                if not (isinstance(v, list) and len(v) == 2 and str(v[0]) in interp_ids)
            }
    else:
        upscale_combine_ids = {
            nid for nid, n in wf.items()
            if n.get("class_type") == "VHS_VideoCombine"
            and not n.get("_meta", {}).get("in_interpolation_group")
        }
        for nid in upscale_combine_ids:
            wf.pop(nid, None)
        for node_id, node in wf.items():
            node["inputs"] = {
                k: v for k, v in node.get("inputs", {}).items()
                if not (isinstance(v, list) and len(v) == 2 and str(v[0]) in upscale_combine_ids)
            }

    return wf


def patch_image_workflow(workflow: dict, image_filename: str,
                         target_height: int, scale_mode: str,
                         src_w: int, src_h: int) -> dict:
    """
    Modifica il workflow immagine API in memoria.
    Imposta il filename di input e calcola scale_by per raggiungere target_height.
    """
    import copy
    wf = copy.deepcopy(workflow)

    # Calcola scale_by
    if scale_mode == "native":
        scale_by = 1.0
    else:
        upscaled_h = src_h * 4
        scale_by = round(target_height / upscaled_h, 4)
        scale_by = max(0.1, min(scale_by, 1.0))  # clamp: non upscalare oltre 4x

    for node_id, node in wf.items():
        class_type = node.get("class_type", "")
        inputs     = node.get("inputs", {})
        title      = node.get("_meta", {}).get("title", "")

        # Imposta immagine input
        if class_type == "LoadImage":
            inputs["image"] = image_filename

        # Imposta scale_by sul nodo Target Resolution (ImageScaleBy)
        if title == "Target Resolution" and class_type == "ImageScaleBy":
            inputs["scale_by"] = scale_by

        node["inputs"] = inputs

    return wf


def strip_meta(workflow: dict) -> dict:
    """Rimuove _meta prima di inviare a ComfyUI."""
    return {
        nid: {k: v for k, v in ndata.items() if k != "_meta"}
        for nid, ndata in workflow.items()
    }


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


async def save_input_image(request: ImageUpscaleRequest,
                           input_dir: Path, job_id: str) -> tuple[Path, int, int]:
    """
    Salva l'immagine input in ComfyUI/input/.
    Ritorna (path, width, height).
    """
    from PIL import Image as PILImage

    dest = input_dir / f"img_{job_id}.png"

    if request.image_base64:
        img_bytes = base64.b64decode(request.image_base64)
        img = PILImage.open(io.BytesIO(img_bytes)).convert("RGB")
        img.save(dest, "PNG")

    elif request.image_url:
        async with aiohttp.ClientSession() as session:
            async with session.get(request.image_url) as resp:
                if resp.status != 200:
                    raise HTTPException(400, f"Download fallito: {request.image_url}")
                data = await resp.read()
        img = PILImage.open(io.BytesIO(data)).convert("RGB")
        img.save(dest, "PNG")

    else:
        raise HTTPException(400, "Fornire image_url o image_base64")

    w, h = img.size
    return dest, w, h


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


def find_output_image(history: dict, prompt_id: str) -> str | None:
    job = history.get(prompt_id, {})
    for node_id, node_out in job.get("outputs", {}).items():
        for f in node_out.get("images", []):
            fname = f.get("filename", "")
            if fname.endswith(".png") or fname.endswith(".jpg"):
                subfolder = f.get("subfolder", "")
                return (subfolder + "/" + fname).lstrip("/")
    return None


# ─────────────────────────────────────────────
# Background task: elaborazione job
# ─────────────────────────────────────────────
def _run_comfyui_job(job_id: str, prompt_id: str, client_id: str) -> str | None:
    """
    Apre una connessione WebSocket a ComfyUI e monitora il job fino al completamento.
    Ritorna un messaggio di errore se fallisce, None se completato con successo.
    """
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
            value   = d.get("value", 0)
            maximum = max(d.get("max", 1), 1)
            jobs[job_id]["progress"]     = int((value / maximum) * 100)
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

    ws_app = websocket.WebSocketApp(ws_url, on_message=on_message, on_error=on_error)
    ws_app.run_forever()

    if error_msg:
        return error_msg
    if not completed:
        return "Job terminato senza conferma di completamento"
    return None


def process_job_sync(job_id: str, workflow: dict, video_filename: str,
                     output_filename: Optional[str]):
    """Esegue il job video in modo sincrono (chiamato in thread separato)."""
    jobs[job_id]["status"]     = "processing"
    jobs[job_id]["started_at"] = time.time()

    try:
        prompt_id, client_id = queue_prompt_sync(strip_meta(workflow))
        jobs[job_id]["prompt_id"] = prompt_id

        error_msg = _run_comfyui_job(job_id, prompt_id, client_id)
        if error_msg:
            jobs[job_id]["status"]  = "error"
            jobs[job_id]["message"] = error_msg
            return

        # Recupera output video
        time.sleep(1)
        history    = requests.get(f"{COMFYUI_URL}/history/{prompt_id}", timeout=10).json()
        output_rel = find_output_video(history, prompt_id)

        if not output_rel:
            jobs[job_id]["status"]  = "error"
            jobs[job_id]["message"] = "Video output non trovato nella history"
            return

        src = Path(COMFYUI_PATH) / "output" / output_rel
        if output_filename:
            final_path = src.parent / (output_filename + ".mp4")
            shutil.copy2(src, final_path)
        else:
            final_path = src

        jobs[job_id]["status"]          = "completed"
        jobs[job_id]["output_path"]     = str(final_path)
        jobs[job_id]["output_filename"] = final_path.name

    except Exception as e:
        jobs[job_id]["status"]  = "error"
        jobs[job_id]["message"] = str(e)


def process_image_job_sync(job_id: str, workflow: dict, image_filename: str,
                           output_filename: Optional[str]):
    """Esegue il job immagine in modo sincrono (chiamato in thread separato)."""
    jobs[job_id]["status"]     = "processing"
    jobs[job_id]["started_at"] = time.time()

    try:
        prompt_id, client_id = queue_prompt_sync(strip_meta(workflow))
        jobs[job_id]["prompt_id"] = prompt_id

        error_msg = _run_comfyui_job(job_id, prompt_id, client_id)
        if error_msg:
            jobs[job_id]["status"]  = "error"
            jobs[job_id]["message"] = error_msg
            return

        # Recupera output immagine
        time.sleep(1)
        history    = requests.get(f"{COMFYUI_URL}/history/{prompt_id}", timeout=10).json()
        output_rel = find_output_image(history, prompt_id)

        if not output_rel:
            jobs[job_id]["status"]  = "error"
            jobs[job_id]["message"] = "Immagine output non trovata nella history"
            return

        src = Path(COMFYUI_PATH) / "output" / output_rel
        if output_filename:
            final_path = src.parent / (output_filename + ".png")
            shutil.copy2(src, final_path)
        else:
            final_path = src

        jobs[job_id]["status"]          = "completed"
        jobs[job_id]["output_path"]     = str(final_path)
        jobs[job_id]["output_filename"] = final_path.name

    except Exception as e:
        jobs[job_id]["status"]  = "error"
        jobs[job_id]["message"] = str(e)


async def run_job_wrapper(job_id: str, workflow: dict, media_filename: str,
                          output_filename: Optional[str], job_type: str = "video"):
    """Wrapper asincrono che esegue il job in un thread."""
    async with semaphore:
        loop = asyncio.get_running_loop()
        if job_type == "image":
            await loop.run_in_executor(
                None, process_image_job_sync,
                job_id, workflow, media_filename, output_filename
            )
        else:
            await loop.run_in_executor(
                None, process_job_sync,
                job_id, workflow, media_filename, output_filename
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

    active_jobs       = sum(1 for j in jobs.values() if j["status"] == "processing")
    workflow_video_ok = Path(WORKFLOW_PATH).exists()
    workflow_image_ok = Path(WORKFLOW_IMAGE_PATH).exists()

    return {
        "status":               "ok",
        "comfyui":              "reachable" if comfyui_ok else "unreachable",
        "comfyui_url":          COMFYUI_URL,
        "queue_size":           queue_size,
        "active_jobs":          active_jobs,
        "max_concurrent_jobs":  MAX_CONCURRENT,
        "workflow_video":       "ok" if workflow_video_ok else "missing",
        "workflow_image":       "ok" if workflow_image_ok else "missing",
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
    try:
        resp = requests.get(f"{COMFYUI_URL}/system_stats", timeout=3)
        if resp.status_code != 200:
            raise Exception()
    except Exception:
        raise HTTPException(status_code=503, detail="ComfyUI non raggiungibile")

    workflow_path = Path(WORKFLOW_PATH)
    if not workflow_path.exists():
        raise HTTPException(status_code=500, detail=f"Workflow non trovato: {WORKFLOW_PATH}")

    active = sum(1 for j in jobs.values() if j["status"] == "processing")
    if active >= MAX_CONCURRENT:
        raise HTTPException(
            status_code=429,
            detail=f"Troppi job attivi ({active}/{MAX_CONCURRENT}). Riprova più tardi."
        )

    job_id = str(uuid.uuid4())

    input_dir = Path(COMFYUI_PATH) / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    video_url      = request.video_url
    video_filename = video_url.split("/")[-1].split("?")[0] or f"input_{job_id}.mp4"
    if not video_filename.endswith(".mp4"):
        video_filename += ".mp4"

    try:
        await download_video_from_url(video_url, input_dir, video_filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore download video: {e}")

    workflow = load_api_workflow(workflow_path)
    patched  = patch_workflow(
        workflow,
        video_filename=video_filename,
        target_height=request.target_height,
        interpolate=request.interpolate,
        fps_multiplier=request.fps_multiplier,
    )

    jobs[job_id] = {
        "job_id":          job_id,
        "status":          "queued",
        "progress":        0,
        "current_node":    None,
        "created_at":      time.time(),
        "started_at":      None,
        "message":         None,
        "output_path":     None,
        "output_filename": None,
        "job_type":        "video",
        "request":         request.dict(),
    }

    background_tasks.add_task(
        run_job_wrapper, job_id, patched, video_filename, request.output_filename, "video"
    )

    target_label = {720: "HD", 1080: "Full HD", 1440: "2K", 2160: "4K"}.get(request.target_height)
    return {
        "job_id":  job_id,
        "status":  "queued",
        "message": f"Job avviato — Target: {target_label} | Interpolazione: {'ON ×' + str(request.fps_multiplier) if request.interpolate else 'OFF'}",
    }


@app.post("/upscale/image", tags=["Upscaling"])
async def upscale_image(
    request: ImageUpscaleRequest,
    background_tasks: BackgroundTasks,
    token: str = Depends(verify_token),
):
    """
    Avvia un job di upscaling immagine con RealESRGAN.

    Accetta un'immagine tramite URL o base64.
    Ritorna immediatamente con un `job_id`.
    Usa `GET /status/{job_id}` per monitorare i progressi.
    Scarica il risultato con `GET /download/image/{job_id}`.
    """
    try:
        requests.get(f"{COMFYUI_URL}/system_stats", timeout=3).raise_for_status()
    except Exception:
        raise HTTPException(status_code=503, detail="ComfyUI non raggiungibile")

    workflow_path = Path(WORKFLOW_IMAGE_PATH)
    if not workflow_path.exists():
        raise HTTPException(status_code=500, detail=f"Workflow immagini non trovato: {WORKFLOW_IMAGE_PATH}")

    active = sum(1 for j in jobs.values() if j["status"] == "processing")
    if active >= MAX_CONCURRENT:
        raise HTTPException(
            status_code=429,
            detail=f"Troppi job attivi ({active}/{MAX_CONCURRENT}). Riprova più tardi."
        )

    job_id    = str(uuid.uuid4())
    input_dir = Path(COMFYUI_PATH) / "input"
    input_dir.mkdir(parents=True, exist_ok=True)

    # Salva immagine e leggi dimensioni originali
    try:
        input_path, src_w, src_h = await save_input_image(request, input_dir, job_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore salvataggio immagine: {e}")

    image_filename = input_path.name

    workflow = load_api_workflow(workflow_path)
    patched  = patch_image_workflow(
        workflow, image_filename,
        request.target_height, request.scale_mode,
        src_w, src_h
    )

    jobs[job_id] = {
        "job_id":          job_id,
        "status":          "queued",
        "progress":        0,
        "current_node":    None,
        "created_at":      time.time(),
        "started_at":      None,
        "message":         None,
        "output_path":     None,
        "output_filename": None,
        "job_type":        "image",
        "request":         request.dict(exclude={"image_base64"}),  # non loggare base64
    }

    background_tasks.add_task(
        run_job_wrapper, job_id, patched, image_filename, request.output_filename, "image"
    )

    return {
        "job_id":         job_id,
        "status":         "queued",
        "message":        f"Immagine in coda — Target: {request.target_height}px | Mode: {request.scale_mode}",
        "src_dimensions": f"{src_w}x{src_h}",
    }


@app.get("/status/{job_id}", response_model=JobStatus, tags=["Upscaling"])
async def get_status(job_id: str, token: str = Depends(verify_token)):
    """
    Controlla lo stato di un job (video o immagine).

    - `queued` → in attesa
    - `processing` → in elaborazione (progress 0-100)
    - `completed` → completato, pronto per il download
    - `error` → errore (vedi campo `message`)
    """
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job non trovato")

    job     = jobs[job_id]
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
        job_type=job.get("job_type", "video"),
    )


@app.get("/download/{job_id}", tags=["Upscaling"])
async def download(job_id: str, token: str = Depends(verify_token)):
    """Scarica il video output di un job completato."""
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


@app.get("/download/image/{job_id}", tags=["Upscaling"])
async def download_image(job_id: str, token: str = Depends(verify_token)):
    """Scarica l'immagine PNG output di un job immagine completato."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job non trovato")

    job = jobs[job_id]

    if job.get("job_type") != "image":
        raise HTTPException(status_code=400, detail="Questo job non è un upscale immagine")

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
        media_type="image/png",
        filename=output_path.name,
    )


@app.get("/jobs", tags=["Sistema"])
async def list_jobs(token: str = Depends(verify_token)):
    """Lista tutti i job con il loro stato."""
    return [
        {
            "job_id":          jid,
            "status":          j["status"],
            "progress":        j["progress"],
            "elapsed_seconds": int(time.time() - j["created_at"]),
            "output_filename": j.get("output_filename"),
            "job_type":        j.get("job_type", "video"),
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
    print(f"  🚀 ComfyUI Upscaler API Server")
    print(f"{'═'*55}")
    print(f"  ComfyUI URL    : {COMFYUI_URL}")
    print(f"  ComfyUI Path   : {COMFYUI_PATH}")
    print(f"  Workflow Video : {WORKFLOW_PATH}")
    print(f"  Workflow Image : {WORKFLOW_IMAGE_PATH}")
    print(f"  Max Jobs       : {MAX_CONCURRENT}")
    print(f"  Porta          : {PORT}")
    print(f"  API Token      : {'*' * len(API_TOKEN)}")
    print(f"{'─'*55}")
    print(f"  📖 Docs: http://0.0.0.0:{PORT}/docs")
    print(f"{'═'*55}\n")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT,
        log_level="info",
    )
