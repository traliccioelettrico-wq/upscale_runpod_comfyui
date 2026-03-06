"""
comfyui_detect.py
-----------------
Utility condivisa: rileva automaticamente il path di ComfyUI,
il path del workflow e carica le variabili dal file .env.
"""

from pathlib import Path
import sys
import os


# ─────────────────────────────────────────────
# Caricamento .env
# ─────────────────────────────────────────────

def load_env(script_path=None):
    """
    Carica le variabili dal file .env cercandolo in:
    1. Stessa cartella dello script chiamante
    2. /workspace/upscaler/.env
    3. /workspace/.env
    Le variabili gia' impostate nell'ambiente NON vengono sovrascritte.
    """
    search_paths = []

    if script_path:
        search_paths.append(Path(script_path).parent / ".env")

    search_paths += [
        Path("/workspace/upscaler/.env"),
        Path("/workspace/.env"),
    ]

    env_file = None
    for p in search_paths:
        if p.exists():
            env_file = p
            break

    if not env_file:
        return  # Nessun .env trovato — silenzioso, non e' un errore

    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key   = key.strip()
            value = value.strip()
            # Non sovrascrivere variabili gia' impostate nel terminale
            if key and value and key not in os.environ:
                os.environ[key] = value


# ─────────────────────────────────────────────
# Posizioni dove cercare ComfyUI
# ─────────────────────────────────────────────
COMFYUI_SEARCH_PATHS = [
    "/workspace/runpod-slim/ComfyUI",
    "/workspace/ComfyUI",
    "/workspace/comfyui",
    "/ComfyUI",
    "/opt/ComfyUI",
    "~/ComfyUI",
]

WORKFLOW_SEARCH_NAMES = [
    "Video-Upscaler-RealESRGAN.json",
    "Video-Upscaler-Next-Diffusion.json",
]


def find_comfyui_path():
    """
    Rileva automaticamente il path di ComfyUI.
    Cerca nelle posizioni comuni, poi nella variabile d'ambiente COMFYUI_PATH.
    Lancia un errore chiaro se non trovato.
    """
    # 1. Variabile d'ambiente esplicita
    env_path = os.environ.get("COMFYUI_PATH")
    if env_path:
        p = Path(env_path)
        if p.exists() and (p / "main.py").exists():
            return p

    # 2. Cerca nelle posizioni comuni
    for candidate in COMFYUI_SEARCH_PATHS:
        p = Path(candidate).expanduser()
        if p.exists() and (p / "main.py").exists():
            return p

    # 3. Cerca ricorsivamente sotto /workspace
    workspace = Path("/workspace")
    if workspace.exists():
        for main_py in workspace.rglob("main.py"):
            parent = main_py.parent
            if (parent / "nodes").exists() and (parent / "models").exists():
                return parent

    print("ERROR: ComfyUI non trovato automaticamente.")
    print("   Specifica il path con --comfyui-path oppure:")
    print("   Aggiungi COMFYUI_PATH=/path/to/ComfyUI nel file .env")
    sys.exit(1)


def find_workflow_path(script_dir):
    """
    Cerca il workflow JSON nella stessa cartella dello script
    e nelle posizioni comuni.
    """
    # 1. Variabile d'ambiente
    env_wf = os.environ.get("WORKFLOW_PATH")
    if env_wf:
        p = Path(env_wf)
        if p.exists():
            return p

    # 2. Cerca nella stessa cartella dello script
    for name in WORKFLOW_SEARCH_NAMES:
        p = Path(script_dir) / name
        if p.exists():
            return p

    # 3. Cerca sotto /workspace
    workspace = Path("/workspace")
    if workspace.exists():
        for name in WORKFLOW_SEARCH_NAMES:
            matches = list(workspace.rglob(name))
            if matches:
                return matches[0]

    return None
