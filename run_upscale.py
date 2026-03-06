#!/usr/bin/env python3
"""
run_upscale.py
--------------
Invia un workflow ComfyUI di upscaling via API REST + WebSocket.
Funziona con QUALSIASI workflow — nessun ID hardcodato.

I parametri configurabili vengono trovati per titolo del nodo:
    - "Target Resolution"  -> altezza target (qualsiasi nodo con questo titolo)
    - "FPS Multiplier"     -> moltiplicatore fps
    - VHS_LoadVideo        -> video di input (trovato per class_type)
    - _meta.in_interpolation_group = true -> nodi interpolazione

Uso:
    python3 run_upscale.py --video input.mp4 --output ./out/ --workflow workflow-API.json
    python3 run_upscale.py --video input.mp4 --output ./out/ --workflow workflow-API.json --target-height 2160
    python3 run_upscale.py --video input.mp4 --output ./out/ --workflow workflow-API.json --interpolate --fps-multiplier 2
"""

import argparse
import json
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path

import requests
import websocket
from tqdm import tqdm

# Auto-detection ComfyUI path + caricamento .env
try:
    from comfyui_detect import find_comfyui_path, load_env
    _SCRIPT_DIR = Path(__file__).parent
    load_env(__file__)
except ImportError:
    def find_comfyui_path(): return None
    def load_env(p=None): pass
    _SCRIPT_DIR = Path(".")

GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):    print(f"{GREEN}✅ {msg}{RESET}")
def warn(msg):  print(f"{YELLOW}⚠️  {msg}{RESET}")
def err(msg):   print(f"{RED}❌ {msg}{RESET}")
def info(msg):  print(f"{CYAN}ℹ️  {msg}{RESET}")


# ═══════════════════════════════════════════════════════════
# Risoluzione workflow API
# ═══════════════════════════════════════════════════════════

def resolve_api_workflow(workflow_arg, script_dir):
    """
    Dato --workflow passato dall'utente:
    - Se è già un file API (ha _meta nei nodi) lo usa direttamente
    - Se è un file UI, lo converte automaticamente
    - Se non specificato, cerca *-API.json nella cartella script
    """
    if workflow_arg:
        p = Path(workflow_arg)
        if not p.exists():
            err(f"Workflow non trovato: {p}")
            sys.exit(1)

        # Controlla se è già formato API
        with open(p) as f:
            wf = json.load(f)

        if isinstance(wf, dict) and all(isinstance(v, dict) and "class_type" in v for v in wf.values()):
            info(f"Workflow API rilevato: {p}")
            return p
        else:
            # E' formato UI, converti
            api_path = p.with_name(p.stem + "-API.json")
            info(f"Workflow UI rilevato, converto in formato API...")
            _convert(p, api_path)
            return api_path

    # Cerca automaticamente nella cartella script
    candidates = list(script_dir.glob("*-API.json")) + list(script_dir.glob("*_API.json"))
    if candidates:
        info(f"Workflow API trovato: {candidates[0]}")
        return candidates[0]

    # Cerca workflow UI e converti
    ui_candidates = list(script_dir.glob("*.json"))
    ui_candidates = [f for f in ui_candidates if "API" not in f.name]
    if ui_candidates:
        ui_path  = ui_candidates[0]
        api_path = ui_path.with_name(ui_path.stem + "-API.json")
        info(f"Workflow UI trovato ({ui_path.name}), converto...")
        _convert(ui_path, api_path)
        return api_path

    err("Nessun workflow JSON trovato. Specifica --workflow /path/al/workflow.json")
    sys.exit(1)


def _convert(ui_path, api_path):
    converter = Path(__file__).parent / "convert_workflow.py"
    if not converter.exists():
        err(f"convert_workflow.py non trovato in {converter.parent}")
        sys.exit(1)
    result = subprocess.run(
        [sys.executable, str(converter), str(ui_path), str(api_path)],
        capture_output=True, text=True
    )
    if result.returncode != 0 or not api_path.exists():
        err(f"Errore conversione workflow: {result.stderr[:300]}")
        sys.exit(1)
    ok(f"Workflow convertito: {api_path.name}")


# ═══════════════════════════════════════════════════════════
# Patch workflow — GENERICO, cerca per titolo
# ═══════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════
# Calcolo automatico frames_per_batch
# ═══════════════════════════════════════════════════════════

def get_available_vram_mb():
    """
    Legge la VRAM disponibile.
    Supporta: NVIDIA (nvidia-smi), AMD (rocm-smi), Intel (xpu-smi),
    PyTorch (torch.cuda / torch.xpu), fallback conservativo 8000 MB.
    """
    # 1. NVIDIA
    try:
        import subprocess
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            free_mb = int(result.stdout.strip().split()[0])
            info(f"GPU NVIDIA rilevata — VRAM libera: {free_mb} MB")
            return free_mb
    except Exception:
        pass

    # 2. AMD (ROCm)
    try:
        import subprocess
        result = subprocess.run(
            ["rocm-smi", "--showmeminfo", "vram", "--json"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            import json as _json
            data = _json.loads(result.stdout)
            for gpu_key, gpu_data in data.items():
                if "VRAM Total Memory (B)" in gpu_data and "VRAM Total Used Memory (B)" in gpu_data:
                    total = int(gpu_data["VRAM Total Memory (B)"])
                    used  = int(gpu_data["VRAM Total Used Memory (B)"])
                    free_mb = (total - used) // (1024 * 1024)
                    info(f"GPU AMD ROCm rilevata — VRAM libera: {free_mb} MB")
                    return free_mb
    except Exception:
        pass

    # 3. PyTorch CUDA (fallback universale per NVIDIA/AMD con driver CUDA)
    try:
        import torch
        if torch.cuda.is_available():
            free_bytes, total_bytes = torch.cuda.mem_get_info(0)
            free_mb = free_bytes // (1024 * 1024)
            info(f"GPU CUDA (PyTorch) rilevata — VRAM libera: {free_mb} MB")
            return free_mb
    except Exception:
        pass

    # 4. Intel XPU (via PyTorch)
    try:
        import torch
        if hasattr(torch, "xpu") and torch.xpu.is_available():
            props = torch.xpu.get_device_properties(0)
            free_mb = props.total_memory // (1024 * 1024)  # stima conservativa
            info(f"GPU Intel XPU rilevata — VRAM stimata: {free_mb} MB")
            return free_mb
    except Exception:
        pass

    # 5. Fallback conservativo
    warn("GPU non rilevata o VRAM non leggibile — uso fallback conservativo (8000 MB)")
    return 8000


def get_video_info(video_path):
    """Legge risoluzione e numero frame del video tramite ffprobe."""
    try:
        import subprocess, json
        result = subprocess.run([
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", str(video_path)
        ], capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            for stream in data.get("streams", []):
                if stream.get("codec_type") == "video":
                    w = int(stream.get("width", 0))
                    h = int(stream.get("height", 0))
                    nb_frames = stream.get("nb_frames")
                    if nb_frames:
                        frames = int(nb_frames)
                    else:
                        # Calcola da duration e fps
                        duration = float(stream.get("duration", 0))
                        fps_str = stream.get("r_frame_rate", "24/1")
                        num, den = fps_str.split("/")
                        fps = float(num) / float(den)
                        frames = int(duration * fps)
                    return w, h, frames
    except Exception:
        pass
    return 0, 0, 0


def calculate_optimal_batch_size(video_path, target_height, upscale_multiplier=4):
    """
    Calcola il frames_per_batch ottimale in base a:
    - VRAM disponibile sulla GPU
    - Risoluzione del frame upscalato
    - Margine di sicurezza del 30%

    Stima memoria per frame (float32):
      width_out * height_out * 3 canali * 4 bytes = bytes per frame
    """
    vram_free_mb = get_available_vram_mb()
    src_w, src_h, total_frames = get_video_info(video_path)

    if src_w == 0 or src_h == 0:
        warn("Impossibile leggere info video, uso batch conservativo (16 frame)")
        return 16, vram_free_mb, 0, 0, 0

    # Dimensione frame dopo upscaling (prima del downscale al target)
    upscaled_w = src_w * upscale_multiplier
    upscaled_h = src_h * upscale_multiplier

    # Calcolo VRAM reale per frame:
    # - ESRGAN processa 1 frame alla volta (picco: frame upscalato 4x)
    # - I frame GIA' processati vengono tenuti ridimensionati al target finale
    # - Quindi usiamo la dimensione TARGET (non quella upscalata 4x) per stimare l'accumulo
    target_w = int(src_w * (target_height / src_h))
    target_h = target_height

    # Bytes per frame accumulato (target finale, float32 RGB)
    bytes_per_frame_stored = target_w * target_h * 3 * 4

    # Picco per singolo frame durante upscaling (4x, float32 RGB)
    bytes_per_frame_peak = upscaled_w * upscaled_h * 3 * 4

    # VRAM disponibile con margine sicurezza 20%
    vram_usable_bytes = (vram_free_mb * 1024 * 1024) * 0.80

    # Overhead fisso: ComfyUI + modello ESRGAN (~600 MB)
    overhead_bytes = 600 * 1024 * 1024

    # VRAM per i frame: totale usabile - overhead - picco singolo frame
    vram_for_frames = max(vram_usable_bytes - overhead_bytes - bytes_per_frame_peak, 256 * 1024 * 1024)

    # Quanti frame (a dimensione target) entrano nella VRAM rimanente
    optimal = max(1, int(vram_for_frames / bytes_per_frame_stored))

    # Se ci stanno tutti, un batch unico
    if total_frames > 0 and optimal >= total_frames:
        optimal = total_frames
        info(f"Tutti i {total_frames} frame entrano in VRAM — processing in unico batch")

    # Cap massimo di sicurezza
    optimal = min(optimal, 5000)

    info(f"Frame target: {target_w}x{target_h} ({bytes_per_frame_stored//1024//1024} MB/frame stored, {bytes_per_frame_peak//1024//1024} MB/frame peak)")

    info(f"VRAM libera: {vram_free_mb} MB | Frame upscalato: {upscaled_w}x{upscaled_h} | ")
    info(f"Frames totali: {total_frames} | frames_per_batch ottimale: {optimal}")

    return optimal, vram_free_mb, src_w, src_h, total_frames


def patch_workflow(workflow, video_filename, target_height, interpolate, fps_multiplier, frames_per_batch=None):
    """
    Modifica il workflow API in memoria.
    Cerca i nodi configurabili per titolo (_meta.title) e class_type.
    Non usa mai ID hardcodati.
    """
    import copy
    wf = copy.deepcopy(workflow)

    for node_id, node in wf.items():
        class_type = node.get("class_type", "")
        inputs     = node.get("inputs", {})
        meta       = node.get("_meta", {})
        title      = meta.get("title", "")

        # ── Video di input ────────────────────────────────
        if class_type == "VHS_LoadVideo":
            inputs["video"] = video_filename

        # ── Target Resolution ─────────────────────────────
        if title == "Target Resolution":
            for key in ("a", "value", "b"):
                if key in inputs and not isinstance(inputs[key], list):
                    inputs[key] = float(target_height)
                    break

        # ── FPS Multiplier ────────────────────────────────
        if title == "FPS Multiplier":
            for key in ("value", "a", "b"):
                if key in inputs and not isinstance(inputs[key], list):
                    inputs[key] = fps_multiplier
                    break

        # ── VHS_BatchManager — frames_per_batch automatico ─
        if class_type == "VHS_BatchManager" and frames_per_batch is not None:
            inputs["frames_per_batch"] = frames_per_batch
            inputs.pop("count", None)  # ComfyUI lo ricalcola automaticamente

        node["inputs"] = inputs

    # ── Gestione interpolazione ───────────────────────────
    interp_ids = {
        nid for nid, n in wf.items()
        if n.get("_meta", {}).get("in_interpolation_group")
    }

    if not interpolate:
        # CASO 1: solo upscale
        # Rimuovi tutti i nodi interpolazione
        for nid in interp_ids:
            wf.pop(nid, None)

        # Rimuovi riferimenti pendenti verso nodi interpolazione rimossi
        for node_id, node in wf.items():
            node["inputs"] = {
                k: v for k, v in node.get("inputs", {}).items()
                if not (isinstance(v, list) and len(v) == 2 and str(v[0]) in interp_ids)
            }

    else:
        # CASO 2: upscale + interpolazione
        # Rimuovi il VHS_VideoCombine del gruppo UPSCALE (non interpolazione)
        # perche' altrimenti ComfyUI genera due video in output
        # Il VHS_VideoCombine che vogliamo e' quello nel gruppo interpolazione (Upscaled_Interpolated_)
        upscale_combine_ids = {
            nid for nid, n in wf.items()
            if n.get("class_type") == "VHS_VideoCombine"
            and not n.get("_meta", {}).get("in_interpolation_group")
        }
        for nid in upscale_combine_ids:
            wf.pop(nid, None)

        # Rimuovi riferimenti pendenti verso il VHS_VideoCombine rimosso
        for node_id, node in wf.items():
            node["inputs"] = {
                k: v for k, v in node.get("inputs", {}).items()
                if not (isinstance(v, list) and len(v) == 2 and str(v[0]) in upscale_combine_ids)
            }

    return wf


def strip_meta(workflow):
    """Rimuove _meta prima di inviare a ComfyUI."""
    return {
        nid: {k: v for k, v in ndata.items() if k != "_meta"}
        for nid, ndata in workflow.items()
    }


# ═══════════════════════════════════════════════════════════
# Comunicazione con ComfyUI
# ═══════════════════════════════════════════════════════════

def check_comfyui(base_url):
    try:
        resp = requests.get(f"{base_url}/system_stats", timeout=5)
        return resp.status_code == 200
    except Exception:
        return False


def upload_video(video_path, comfyui_path):
    input_dir = Path(comfyui_path) / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    dest = input_dir / video_path.name
    if not dest.exists():
        shutil.copy2(video_path, dest)
    return video_path.name


def queue_prompt(workflow, base_url):
    client_id = str(uuid.uuid4())
    payload   = {"prompt": workflow, "client_id": client_id}
    resp      = requests.post(f"{base_url}/prompt", json=payload, timeout=15)

    if resp.status_code != 200:
        try:
            data = resp.json()
            if "error" in data:
                err(f"ComfyUI error: {data['error'].get('message','')} — {data['error'].get('details','')}")
            if "node_errors" in data:
                for nid, nerr_data in data["node_errors"].items():
                    for e in nerr_data.get("errors", []):
                        err(f"  Nodo {nid} ({nerr_data.get('class_type','')}): {e.get('details', e.get('message',''))}")
        except Exception:
            err(f"HTTP {resp.status_code}: {resp.text[:300]}")
        sys.exit(1)

    data = resp.json()
    return data["prompt_id"], client_id


def get_history(prompt_id, base_url):
    resp = requests.get(f"{base_url}/history/{prompt_id}", timeout=10)
    resp.raise_for_status()
    return resp.json()


def find_output_video(history, prompt_id, interpolate=False):
    """
    Cerca il video output nella history di ComfyUI.
    Se interpolate=True cerca Upscaled_Interpolated_*.mp4
    altrimenti cerca Upscaled_*.mp4 (escluso Interpolated)
    """
    job     = history.get(prompt_id, {})
    outputs = job.get("outputs", {})

    candidates = []
    for node_id, node_out in outputs.items():
        for key in ("gifs", "videos", "images"):
            for f in node_out.get(key, []):
                fname = f.get("filename", "")
                if fname.endswith(".mp4"):
                    subfolder = f.get("subfolder", "")
                    path = (subfolder + "/" + fname).lstrip("/")
                    candidates.append((fname, path))

    if not candidates:
        return None

    if interpolate:
        # Preferisci il file con Interpolated nel nome
        for fname, path in candidates:
            if "Interpolated" in fname:
                return path
    else:
        # Preferisci il file senza Interpolated nel nome
        for fname, path in candidates:
            if "Interpolated" not in fname:
                return path

    # Fallback: ritorna il primo trovato
    return candidates[0][1]


# ═══════════════════════════════════════════════════════════
# WebSocket progress
# ═══════════════════════════════════════════════════════════

def listen_progress(prompt_id, client_id, base_url):
    ws_url = base_url.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_url}/ws?clientId={client_id}"

    success      = False
    current_node = ""
    pbar         = None
    start_time   = time.time()

    def on_message(ws, message):
        nonlocal success, current_node, pbar
        try:
            data = json.loads(message)
        except Exception:
            return

        msg_type = data.get("type", "")
        d        = data.get("data", {})

        if d.get("prompt_id") and d["prompt_id"] != prompt_id:
            return

        if msg_type == "execution_start":
            info(f"Elaborazione avviata (job: {prompt_id[:8]}...)")

        elif msg_type == "executing":
            node_id = d.get("node")
            if node_id:
                current_node = node_id
                if pbar:
                    pbar.set_postfix_str(f"Nodo: {node_id}", refresh=True)
            else:
                if pbar:
                    pbar.n = pbar.total
                    pbar.refresh()
                    pbar.close()
                    pbar = None
                success = True

        elif msg_type == "progress":
            value   = d.get("value", 0)
            maximum = d.get("max", 1)
            node_id = d.get("node", current_node)
            if pbar is None:
                pbar = tqdm(
                    total=maximum,
                    unit="frame",
                    desc=f"{CYAN}Upscaling{RESET}",
                    bar_format="{l_bar}{bar}| {n}/{total} frame [{elapsed}<{remaining}]",
                    dynamic_ncols=True,
                )
            pbar.n = value
            pbar.total = maximum
            pbar.set_postfix_str(f"Nodo: {node_id}", refresh=True)

        elif msg_type == "execution_error":
            if pbar: pbar.close()
            err(f"Errore ComfyUI: {d.get('exception_message', 'sconosciuto')}")
            err(f"Nodo: {d.get('node_type','?')} (id: {d.get('node_id','?')})")
            success = False
            ws.close()

        elif msg_type == "execution_complete":
            if pbar: pbar.close()
            success = True
            ws.close()

    def on_error(ws, error):
        nonlocal success
        if pbar: pbar.close()
        err(f"WebSocket error: {error}")
        success = False

    def on_close(ws, *a): pass

    websocket.WebSocketApp(
        ws_url,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    ).run_forever()
    return success


# ═══════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Upscaling video tramite ComfyUI API")
    parser.add_argument("--video",          required=True,  help="Path al video di input")
    parser.add_argument("--output",         required=True,  help="Cartella di output")
    parser.add_argument("--workflow",       default=None,   help="Path workflow JSON (UI o API, auto-rilevato se omesso)")
    parser.add_argument("--target-height",  type=int, default=1080, choices=[720, 1080, 1440, 2160])
    parser.add_argument("--interpolate",    action="store_true")
    parser.add_argument("--fps-multiplier", type=int, default=2, choices=[2, 3, 4])
    parser.add_argument("--comfyui-url",    default="http://127.0.0.1:8188")
    parser.add_argument("--comfyui-path",   default=None)
    args = parser.parse_args()

    video_path  = Path(args.video)
    output_path = Path(args.output)
    base_url    = args.comfyui_url.rstrip("/")

    comfyui_path = args.comfyui_path or str(find_comfyui_path())

    if not video_path.exists():
        err(f"Video non trovato: {video_path}")
        sys.exit(1)

    print(f"\n{BOLD}🎬 ComfyUI Video Upscaler{RESET}\n{'─'*50}")

    # Connessione ComfyUI
    info(f"Connessione a ComfyUI: {base_url}")
    if not check_comfyui(base_url):
        err(f"ComfyUI non raggiungibile su {base_url}")
        sys.exit(1)
    ok("ComfyUI raggiungibile")

    # Risolvi workflow
    workflow_path = resolve_api_workflow(args.workflow, _SCRIPT_DIR)

    with open(workflow_path) as f:
        workflow = json.load(f)

    # Copia video
    info(f"Video input: {video_path.name} ({video_path.stat().st_size // 1024 // 1024} MB)")
    video_filename = upload_video(video_path, comfyui_path)
    ok("Video copiato in ComfyUI/input/")

    # Calcolo automatico frames_per_batch ottimale
    optimal_batch, vram_mb, src_w, src_h, total_frames = calculate_optimal_batch_size(
        video_path, args.target_height
    )

    # Patch
    patched = patch_workflow(
        workflow,
        video_filename=video_filename,
        target_height=args.target_height,
        interpolate=args.interpolate,
        fps_multiplier=args.fps_multiplier,
        frames_per_batch=optimal_batch,
    )

    label = {720: "HD", 1080: "Full HD", 1440: "2K", 2160: "4K"}.get(args.target_height, str(args.target_height))
    info(f"Target: {label} ({args.target_height}p) | Interpolazione: {'ON x' + str(args.fps_multiplier) if args.interpolate else 'OFF'}")

    # Invia
    info("Invio workflow a ComfyUI...")
    prompt_id, client_id = queue_prompt(strip_meta(patched), base_url)
    ok(f"Job in coda | ID: {prompt_id}")

    # Progress
    print()
    start   = time.time()
    success = listen_progress(prompt_id, client_id, base_url)
    elapsed = int(time.time() - start)

    if not success:
        err("Elaborazione fallita.")
        sys.exit(1)

    # Output
    time.sleep(1)
    history    = get_history(prompt_id, base_url)
    output_rel = find_output_video(history, prompt_id, interpolate=args.interpolate)

    if not output_rel:
        err(f"Video output non trovato. Controlla manualmente: {comfyui_path}/output/")
        sys.exit(1)

    output_src = Path(comfyui_path) / "output" / output_rel
    if output_path.is_dir() or not output_path.suffix:
        output_path.mkdir(parents=True, exist_ok=True)
        final_path = output_path / output_src.name
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        final_path = output_path

    shutil.copy2(output_src, final_path)

    mins, secs = divmod(elapsed, 60)
    print()
    ok(f"Completato in {mins}m {secs}s")
    ok(f"Output: {final_path}")
    info(f"Dimensione: {final_path.stat().st_size // 1024 // 1024} MB")


if __name__ == "__main__":
    main()
