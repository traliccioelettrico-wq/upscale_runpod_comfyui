#!/usr/bin/env python3
"""
install_workflow_dependencies.py
---------------------------------
Analizza un workflow ComfyUI JSON, rileva custom nodes e modelli mancanti
e li installa automaticamente senza sovrascrivere nulla di esistente.

Uso:
    python install_workflow_dependencies.py --workflow Video-Upscaler-RealESRGAN.json
    python install_workflow_dependencies.py --workflow workflow.json --dry-run
    python install_workflow_dependencies.py --workflow workflow.json --comfyui-path /workspace/ComfyUI
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import requests
from tqdm import tqdm

# Auto-detection ComfyUI path + caricamento .env
try:
    from comfyui_detect import find_comfyui_path, find_workflow_path, load_env
    _SCRIPT_DIR = Path(__file__).parent
    load_env(__file__)  # Carica .env prima di tutto
except ImportError:
    def find_comfyui_path(): return None
    def find_workflow_path(d): return None
    def load_env(p=None): pass
    _SCRIPT_DIR = Path(".")

# ─────────────────────────────────────────────
# Colori terminale
# ─────────────────────────────────────────────
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
def title(msg): print(f"\n{BOLD}{msg}{RESET}\n{'─'*60}")


# ─────────────────────────────────────────────
# Mapping nodo → cartella modello
# ─────────────────────────────────────────────
NODE_TO_MODEL_FOLDER = {
    "CheckpointLoaderSimple":        "models/checkpoints/",
    "CheckpointLoader":              "models/checkpoints/",
    "unCLIPCheckpointLoader":        "models/checkpoints/",
    "ImageOnlyCheckpointLoader":     "models/checkpoints/",
    "UpscaleModelLoader":            "models/upscale_models/",
    "VAELoader":                     "models/vae/",
    "LoraLoader":                    "models/loras/",
    "LoraLoaderModelOnly":           "models/loras/",
    "Power Lora Loader (rgthree)":   "models/loras/",
    "ControlNetLoader":              "models/controlnet/",
    "DiffControlNetLoader":          "models/controlnet/",
    "CLIPLoader":                    "models/clip/",
    "DualCLIPLoader":                "models/clip/",
    "TripleCLIPLoader":              "models/clip/",
    "CLIPVisionLoader":              "models/clip_vision/",
    "UNETLoader":                    "models/unet/",
    "FaceRestoreModelLoader":        "models/facerestore_models/",
    "RIFE VFI":                      "models/rife/",
    "FILM VFI":                      "models/FILM/",
    "FLAVR VFI":                     "models/FLAVR/",
    "GMFSS Fortuna VFI":             "models/GMFSS/",
    "IPAdapterModelLoader":          "models/ipadapter/",
    "IPAdapterUnifiedLoader":        "models/ipadapter/",
    "InstantIDModelLoader":          "models/instantid/",
    "InsightFaceLoader":             "models/insightface/",
    "FaceAnalysisModels":            "models/insightface/",
    "GLIGENLoader":                  "models/gligen/",
    "StyleModelLoader":              "models/style_models/",
    "PhotoMakerLoader":              "models/photomaker/",
    "PulidModelLoader":              "models/pulid/",
    "UltralyticsDetectorProvider":   "models/ultralytics/",
    "SAMLoader":                     "models/sams/",
    "GroundingDinoModelLoader":      "models/grounding-dino/",
    "ADE_LoadAnimateDiffModel":      "models/animatediff_models/",
    "ADE_LoadMotionLora":            "models/animatediff_motion_lora/",
    "INPAINT_LoadInpaintModel":      "models/inpaint/",
    "SpandrelImageToImage":          "models/upscale_models/",
}

# Nodi che espongono il filename in widgets_values[0]
MODEL_LOADER_NODES = set(NODE_TO_MODEL_FOLDER.keys())

# ─────────────────────────────────────────────
# Database interno URL modelli comuni
# ─────────────────────────────────────────────
KNOWN_MODEL_URLS = {
    "RealESRGAN_x4plus.pth": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
    "RealESRGAN_x4plus_anime_6B.pth": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus_anime_6B.pth",
    "RealESRGAN_x2plus.pth": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth",
    "4x-AnimeSharp.pth": "https://huggingface.co/utnah/esrgan/resolve/main/4x-AnimeSharp.pth",
    "4x_NMKD-Siax_200k.pth": "https://huggingface.co/uwg/upscaler/resolve/main/ESRGAN/4x_NMKD-Siax_200k.pth",
    "4x-UltraSharp.pth": "https://huggingface.co/uwg/upscaler/resolve/main/ESRGAN/4x-UltraSharp.pth",
    "codeformer.pth": "https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth",
}

# Modelli con URL multipli da provare in ordine (fonte: codice plugin installato)
KNOWN_MODEL_URLS_MULTI = {
    "rife47.pth": [
        "https://huggingface.co/marduk191/rife/resolve/main/rife47.pth",
        "https://huggingface.co/wavespeed/misc/resolve/main/rife/rife47.pth",
        "https://huggingface.co/MachineDelusions/RIFE/resolve/main/rife47.pth",
        "https://huggingface.co/jasonot/mycomfyui/resolve/main/rife47.pth",
    ],
    "rife46.pth": [
        "https://huggingface.co/marduk191/rife/resolve/main/rife46.pth",
        "https://huggingface.co/MachineDelusions/RIFE/resolve/main/rife46.pth",
    ],
    "rife49.pth": [
        "https://huggingface.co/marduk191/rife/resolve/main/rife49.pth",
        "https://huggingface.co/MachineDelusions/RIFE/resolve/main/rife49.pth",
    ],
}

# ─────────────────────────────────────────────
# ComfyUI Manager node list URL
# ─────────────────────────────────────────────
COMFYUI_MANAGER_NODE_LIST = (
    "https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main/custom-node-list.json"
)
COMFYUI_REGISTRY_URL = "https://registry.comfy.org/nodes/{cnr_id}"


# ═══════════════════════════════════════════════════════════
# STEP 1 — Parsing del workflow
# ═══════════════════════════════════════════════════════════

def parse_workflow(workflow_path: str) -> dict:
    with open(workflow_path) as f:
        return json.load(f)


def extract_required_custom_nodes(workflow: dict) -> list[dict]:
    """Estrae la lista univoca di custom nodes richiesti dal workflow."""
    seen = set()
    nodes = []
    for node in workflow.get("nodes", []):
        props = node.get("properties", {})
        cnr_id = props.get("cnr_id") or props.get("aux_id")
        if cnr_id and cnr_id not in seen:
            seen.add(cnr_id)
            nodes.append({
                "cnr_id": cnr_id,
                "node_type": node.get("type"),
                "ver": props.get("ver"),
            })
    return nodes


def extract_required_models(workflow: dict) -> list[dict]:
    """Estrae la lista di modelli richiesti dal workflow."""
    results = []
    seen = set()
    for node in workflow.get("nodes", []):
        node_type = node.get("type", "")
        folder = NODE_TO_MODEL_FOLDER.get(node_type)
        if not folder:
            continue
        widgets = node.get("widgets_values", [])
        # Gestione widgets come lista o dict
        if isinstance(widgets, dict):
            widgets = list(widgets.values())
        if not widgets:
            continue
        filename = widgets[0] if isinstance(widgets[0], str) else None
        if not filename:
            continue
        if not any(filename.endswith(ext) for ext in (".pth", ".safetensors", ".ckpt", ".bin")):
            continue
        key = (filename, folder)
        if key not in seen:
            seen.add(key)
            results.append({
                "node_type": node_type,
                "filename": filename,
                "destination_folder": folder,
            })
    return results


# ═══════════════════════════════════════════════════════════
# STEP 2 — Risoluzione URL custom nodes
# ═══════════════════════════════════════════════════════════

def fetch_manager_node_list() -> dict:
    """Scarica la lista dei custom nodes da ComfyUI Manager."""
    info("Scarico lista custom nodes da ComfyUI Manager...")
    try:
        resp = requests.get(COMFYUI_MANAGER_NODE_LIST, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        # Indicizza per id e per titolo normalizzato
        index = {}
        for item in data.get("custom_nodes", []):
            node_id = item.get("id", "")
            if node_id:
                index[node_id] = item
            # Anche per riferimento parziale
            for ref in item.get("files", []):
                basename = ref.split("/")[-1].replace(".py", "")
                index[basename.lower()] = item
        ok(f"Lista caricata: {len(index)} entries")
        return index
    except Exception as e:
        warn(f"Impossibile scaricare la lista ComfyUI Manager: {e}")
        return {}


def resolve_node_github_url(cnr_id: str, manager_index: dict) -> str | None:
    """Risolve l'URL GitHub di un custom node."""
    # 1. Cerca nel manager index
    entry = manager_index.get(cnr_id)
    if entry:
        ref = entry.get("reference")
        if ref and ref.startswith("http"):
            return ref

    # 2. Prova ComfyUI Registry
    try:
        url = COMFYUI_REGISTRY_URL.format(cnr_id=cnr_id)
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("repository") or data.get("source_code_url")
    except Exception:
        pass

    # 3. Fallback: costruisci URL GitHub da cnr_id (es. "author/repo")
    if "/" in cnr_id:
        return f"https://github.com/{cnr_id}"

    return None


# ═══════════════════════════════════════════════════════════
# STEP 3 — Risoluzione URL modelli
# ═══════════════════════════════════════════════════════════

def get_hf_headers() -> dict:
    """Ritorna gli header HTTP con il token HuggingFace se disponibile."""
    token = os.environ.get("HF_TOKEN", "").strip()
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def resolve_model_urls(filename: str) -> list:
    """
    Risolve la lista di URL di download per un modello.
    Ritorna una lista ordinata da provare in sequenza.
    """
    hf_headers = get_hf_headers()

    # 1. Database interno multi-URL (es. rife47.pth con fallback)
    if filename in KNOWN_MODEL_URLS_MULTI:
        return KNOWN_MODEL_URLS_MULTI[filename]

    # 2. Database interno singolo URL
    if filename in KNOWN_MODEL_URLS:
        return [KNOWN_MODEL_URLS[filename]]

    # 3. Cerca su HuggingFace
    try:
        name = filename.replace(".pth", "").replace(".safetensors", "")
        resp = requests.get(
            f"https://huggingface.co/api/models?search={name}&limit=5",
            headers=hf_headers,
            timeout=10,
        )
        if resp.status_code == 200:
            results = resp.json()
            candidates = []
            for model in results:
                model_id = model.get("id", "")
                candidate = f"https://huggingface.co/{model_id}/resolve/main/{filename}"
                head = requests.head(candidate, headers=hf_headers, timeout=5, allow_redirects=True)
                if head.status_code == 200:
                    candidates.append(candidate)
            if candidates:
                return candidates
    except Exception:
        pass

    # 4. Cerca su OpenModelDB
    try:
        name = filename.replace(".pth", "").replace("_", "-").replace(" ", "-")
        resp = requests.get(
            f"https://openmodeldb.info/api/v1/models?q={name}",
            timeout=10,
        )
        if resp.status_code == 200:
            results = resp.json()
            if results:
                url = results[0].get("downloadUrl")
                if url:
                    return [url]
    except Exception:
        pass

    return []


# ═══════════════════════════════════════════════════════════
# STEP 4 — Installazione custom nodes
# ═══════════════════════════════════════════════════════════

def install_custom_node(cnr_id: str, github_url: str, custom_nodes_path: Path, dry_run: bool) -> str:
    """
    Clona il repository se non esiste già.
    Ritorna: "installed" | "skipped" | "error"
    """
    # Determina nome cartella dal URL
    repo_name = github_url.rstrip("/").split("/")[-1]
    dest = custom_nodes_path / repo_name

    if dest.exists():
        return "skipped"

    if dry_run:
        info(f"  [DRY-RUN] git clone {github_url} → {dest}")
        return "dry-run"

    try:
        info(f"  git clone {github_url}")
        subprocess.run(
            ["git", "clone", "--depth=1", github_url, str(dest)],
            check=True,
            capture_output=True,
        )
        # Installa requirements se presenti
        req_file = dest / "requirements.txt"
        if req_file.exists():
            info(f"  pip install -r {req_file}")
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "-r", str(req_file),
                 "--quiet", "--break-system-packages"],
                check=False,
                capture_output=True,
            )
        return "installed"
    except subprocess.CalledProcessError as e:
        err(f"  Errore git clone: {e.stderr.decode()[:200]}")
        return "error"


# ═══════════════════════════════════════════════════════════
# STEP 5 — Download modelli
# ═══════════════════════════════════════════════════════════

def download_model(filename: str, urls: list, dest_folder: Path, dry_run: bool) -> str:
    """
    Scarica il modello provando gli URL in sequenza fino al primo successo.
    - Usa HF_TOKEN per i download da HuggingFace
    - Gestisce file parziali
    - Idempotente: se il file esiste già e ha dimensione > 0, salta
    Ritorna: "downloaded" | "skipped" | "error" | "dry-run"
    """
    dest_folder.mkdir(parents=True, exist_ok=True)
    dest_file = dest_folder / filename

    # Skip se già presente e non vuoto
    if dest_file.exists() and dest_file.stat().st_size > 0:
        return "skipped"

    # Rimuovi eventuale file parziale da run precedente
    if dest_file.exists() and dest_file.stat().st_size == 0:
        dest_file.unlink()

    if dry_run:
        info(f"  [DRY-RUN] Scaricerei {filename} → {dest_folder}")
        info(f"  [DRY-RUN] URL disponibili: {len(urls)}")
        return "dry-run"

    hf_headers = get_hf_headers()

    for i, url in enumerate(urls):
        headers = hf_headers if "huggingface.co" in url else {}
        try:
            info(f"  Download [{i+1}/{len(urls)}]: {url}")
            resp = requests.get(url, stream=True, timeout=60, headers=headers)
            resp.raise_for_status()
            total = int(resp.headers.get("content-length", 0))
            with open(dest_file, "wb") as f, tqdm(
                total=total,
                unit="B",
                unit_scale=True,
                unit_divisor=1024,
                desc=f"    {filename[:40]}",
                leave=False,
            ) as bar:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
                    bar.update(len(chunk))

            if dest_file.stat().st_size == 0:
                dest_file.unlink()
                raise Exception("File scaricato è vuoto")

            return "downloaded"

        except Exception as e:
            warn(f"  URL {i+1} fallito: {e}")
            if dest_file.exists():
                dest_file.unlink()
            if i < len(urls) - 1:
                info(f"  Provo URL successivo...")
            continue

    err(f"  Tutti gli URL falliti per: {filename}")
    return "error"


# ═══════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Installa custom nodes e modelli per un workflow ComfyUI"
    )
    parser.add_argument("--workflow",      default=None,  help="Path al workflow JSON (auto-rilevato se omesso)")
    parser.add_argument("--comfyui-path",  default=None,  help="Path root ComfyUI (auto-rilevato se omesso)")
    parser.add_argument("--dry-run",       action="store_true", help="Simula senza installare")
    args = parser.parse_args()

    # Auto-detection ComfyUI
    if args.comfyui_path:
        comfyui_root = Path(args.comfyui_path)
    else:
        info("Ricerca automatica di ComfyUI...")
        comfyui_root = find_comfyui_path()
        ok(f"ComfyUI trovato in: {comfyui_root}")

    # Auto-detection workflow
    if args.workflow:
        workflow_file = args.workflow
    else:
        info("Ricerca automatica del workflow JSON...")
        wf = find_workflow_path(_SCRIPT_DIR)
        if not wf:
            err("Workflow JSON non trovato. Specifica --workflow /path/al/workflow.json")
            sys.exit(1)
        workflow_file = str(wf)
        ok(f"Workflow trovato in: {workflow_file}")
    args.workflow = workflow_file
    custom_nodes_path = comfyui_root / "custom_nodes"

    if not comfyui_root.exists():
        err(f"ComfyUI non trovato in: {comfyui_root}")
        sys.exit(1)

    if args.dry_run:
        warn("Modalità DRY-RUN — nessuna modifica verrà effettuata\n")

    # Mostra stato HF_TOKEN
    hf_token = os.environ.get("HF_TOKEN", "").strip()
    if hf_token:
        ok(f"HuggingFace token rilevato ({'*' * 8}{hf_token[-4:]})")
    else:
        warn("HF_TOKEN non impostato — i modelli privati HuggingFace potrebbero fallire")
        warn("Per impostarlo: export HF_TOKEN='il_tuo_token_huggingface'")

    # ── Parsing workflow ──────────────────────────────────
    title("📄 Analisi workflow")
    workflow = parse_workflow(args.workflow)
    required_nodes  = extract_required_custom_nodes(workflow)
    required_models = extract_required_models(workflow)
    info(f"Custom nodes richiesti: {len(required_nodes)}")
    info(f"Modelli richiesti:      {len(required_models)}")

    # ── Custom nodes ──────────────────────────────────────
    title("🔌 Custom Nodes")
    manager_index = fetch_manager_node_list()

    report_nodes = []
    for node in required_nodes:
        cnr_id = node["cnr_id"]
        github_url = resolve_node_github_url(cnr_id, manager_index)

        if not github_url:
            warn(f"  URL non trovato per: {cnr_id}")
            report_nodes.append({"cnr_id": cnr_id, "status": "not_found"})
            continue

        result = install_custom_node(cnr_id, github_url, custom_nodes_path, args.dry_run)

        if result == "installed":
            ok(f"  Installato: {cnr_id}")
        elif result == "skipped":
            info(f"  Già presente: {cnr_id} (skip)")
        elif result == "dry-run":
            info(f"  [DRY-RUN]: {cnr_id} → {github_url}")
        else:
            err(f"  Errore: {cnr_id}")

        report_nodes.append({"cnr_id": cnr_id, "github_url": github_url, "status": result})

    # ── Modelli ───────────────────────────────────────────
    title("📦 Modelli")
    report_models = []
    for model in required_models:
        filename = model["filename"]
        dest_folder = comfyui_root / model["destination_folder"]
        dest_file = dest_folder / filename

        if dest_file.exists() and dest_file.stat().st_size > 0:
            info(f"  Già presente: {filename} (skip)")
            report_models.append({**model, "status": "skipped"})
            continue

        info(f"  Ricerca URL per: {filename}")
        urls = resolve_model_urls(filename)

        if not urls:
            warn(f"  URL non trovato per: {filename}")
            warn(f"  → Scaricalo manualmente in: {dest_folder}")
            report_models.append({**model, "status": "not_found", "urls": []})
            continue

        result = download_model(filename, urls, dest_folder, args.dry_run)

        if result == "downloaded":
            ok(f"  Scaricato: {filename} → {dest_folder}")
        elif result == "skipped":
            info(f"  Già presente: {filename} (skip)")
        elif result == "dry-run":
            info(f"  [DRY-RUN]: {filename} → {dest_folder}")
        else:
            err(f"  Errore download: {filename}")

        report_models.append({**model, "status": result, "urls": urls})

    # ── Report finale ─────────────────────────────────────
    title("📋 Riepilogo")
    installed_n = sum(1 for n in report_nodes if n["status"] == "installed")
    skipped_n   = sum(1 for n in report_nodes if n["status"] == "skipped")
    failed_n    = sum(1 for n in report_nodes if n["status"] in ("error", "not_found"))
    downloaded_m = sum(1 for m in report_models if m["status"] == "downloaded")
    skipped_m    = sum(1 for m in report_models if m["status"] == "skipped")
    failed_m     = sum(1 for m in report_models if m["status"] in ("error", "not_found"))

    print(f"  Custom nodes → installati: {installed_n} | già presenti: {skipped_n} | falliti: {failed_n}")
    print(f"  Modelli      → scaricati:  {downloaded_m} | già presenti: {skipped_m} | falliti: {failed_m}")

    if failed_n > 0 or failed_m > 0:
        print()
        warn("Alcuni elementi richiedono azione manuale:")
        for n in report_nodes:
            if n["status"] in ("error", "not_found"):
                print(f"  • Node: {n['cnr_id']} — cerca su https://registry.comfy.org")
        for m in report_models:
            if m["status"] in ("error", "not_found"):
                print(f"  • Model: {m['filename']} → cartella: {m['destination_folder']}")
                print(f"           Cerca su https://openmodeldb.info o https://huggingface.co")

    # Salva report JSON
    report = {
        "workflow": args.workflow,
        "comfyui_path": str(comfyui_root),
        "dry_run": args.dry_run,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "custom_nodes": report_nodes,
        "models": report_models,
    }
    report_path = Path("install_report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    ok(f"\nReport salvato in: {report_path}")

    if not args.dry_run and (installed_n > 0 or downloaded_m > 0):
        print()
        warn("Riavvia ComfyUI per caricare i nuovi custom nodes.")


if __name__ == "__main__":
    main()
