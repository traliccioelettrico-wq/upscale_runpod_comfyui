# ============================================================
# ComfyUI — Node Type → Model Folder Mapping
# ============================================================
# Uso: dato il campo "type" di un nodo nel JSON del workflow,
# restituisce la cartella di destinazione del modello relativa
# alla root di ComfyUI (es. /workspace/ComfyUI/)
#
# Convenzione widgets_values:
# Per la maggior parte dei nodi il nome del file modello
# è il primo elemento di widgets_values[0].
# Eccezioni documentate inline.
# ============================================================

NODE_TO_MODEL_FOLDER = {

    # ----------------------------------------------------------
    # CHECKPOINT / MODELLI BASE
    # ----------------------------------------------------------
    "CheckpointLoaderSimple":           "models/checkpoints/",
    "CheckpointLoader":                 "models/checkpoints/",
    "unCLIPCheckpointLoader":           "models/checkpoints/",
    "ImageOnlyCheckpointLoader":        "models/checkpoints/",  # per SVD

    # ----------------------------------------------------------
    # UPSCALER
    # ----------------------------------------------------------
    "UpscaleModelLoader":               "models/upscale_models/",

    # ----------------------------------------------------------
    # VAE
    # ----------------------------------------------------------
    "VAELoader":                        "models/vae/",

    # ----------------------------------------------------------
    # LORA
    # ----------------------------------------------------------
    "LoraLoader":                       "models/loras/",
    "LoraLoaderModelOnly":              "models/loras/",
    "Power Lora Loader (rgthree)":      "models/loras/",

    # ----------------------------------------------------------
    # CONTROLNET
    # ----------------------------------------------------------
    "ControlNetLoader":                 "models/controlnet/",
    "DiffControlNetLoader":             "models/controlnet/",

    # ----------------------------------------------------------
    # CLIP
    # ----------------------------------------------------------
    "CLIPLoader":                       "models/clip/",
    "DualCLIPLoader":                   "models/clip/",         # widgets_values[0] e [1]
    "TripleCLIPLoader":                 "models/clip/",         # widgets_values[0], [1], [2]

    # ----------------------------------------------------------
    # CLIP VISION
    # ----------------------------------------------------------
    "CLIPVisionLoader":                 "models/clip_vision/",

    # ----------------------------------------------------------
    # UNET / DIFFUSION MODEL
    # ----------------------------------------------------------
    "UNETLoader":                       "models/unet/",
    "ModelSamplingFlux":                "models/unet/",

    # ----------------------------------------------------------
    # EMBEDDING / TEXTUAL INVERSION
    # ----------------------------------------------------------
    # Nota: gli embedding sono referenziati inline nel prompt
    # con sintassi "embedding:nome" — non hanno un nodo loader dedicato
    # Cartella di riferimento:
    # "models/embeddings/"

    # ----------------------------------------------------------
    # FACE RESTORE
    # ----------------------------------------------------------
    "FaceRestoreModelLoader":           "models/facerestore_models/",
    "FaceRestoreCFWithModel":           "models/facerestore_models/",  # usa il modello del loader

    # ----------------------------------------------------------
    # FRAME INTERPOLATION (RIFE & altri)
    # ----------------------------------------------------------
    "RIFE VFI":                         "models/rife/",
    "FILM VFI":                         "models/FILM/",
    "FLAVR VFI":                        "models/FLAVR/",
    "GMFSS Fortuna VFI":               "models/GMFSS/",
    "IFNet VFI":                        "models/IFNet/",
    "KSampler VFI":                     "models/rife/",

    # ----------------------------------------------------------
    # INSTANT ID / IP ADAPTER
    # ----------------------------------------------------------
    "IPAdapterModelLoader":             "models/ipadapter/",
    "IPAdapterUnifiedLoader":           "models/ipadapter/",
    "InstantIDModelLoader":             "models/instantid/",
    "InstantIDFaceAnalysis":            "models/insightface/",

    # ----------------------------------------------------------
    # INSIGHTFACE / FACE ANALYSIS
    # ----------------------------------------------------------
    "InsightFaceLoader":                "models/insightface/",
    "FaceAnalysisModels":               "models/insightface/",

    # ----------------------------------------------------------
    # REACTOR / FACE SWAP
    # ----------------------------------------------------------
    "ReActorLoadFaceModel":             "models/reactor/faces/",
    "ReActorFaceSwap":                  "models/reactor/",
    "ReActorBuildFaceModel":            "models/reactor/faces/",

    # ----------------------------------------------------------
    # GLIGEN
    # ----------------------------------------------------------
    "GLIGENLoader":                     "models/gligen/",

    # ----------------------------------------------------------
    # STYLE MODEL
    # ----------------------------------------------------------
    "StyleModelLoader":                 "models/style_models/",

    # ----------------------------------------------------------
    # PHOTOMAKER
    # ----------------------------------------------------------
    "PhotoMakerLoader":                 "models/photomaker/",

    # ----------------------------------------------------------
    # PULID
    # ----------------------------------------------------------
    "PulidModelLoader":                 "models/pulid/",
    "PulidInsightFaceLoader":           "models/insightface/",

    # ----------------------------------------------------------
    # SEGMENTATION / DETECTION
    # ----------------------------------------------------------
    "UltralyticsDetectorProvider":      "models/ultralytics/",
    "SAMLoader":                        "models/sams/",
    "GroundingDinoModelLoader":         "models/grounding-dino/",
    "BboxDetectorSEGS":                 "models/ultralytics/bbox/",
    "SegmDetectorSEGS":                 "models/ultralytics/segm/",

    # ----------------------------------------------------------
    # DEPTH / NORMAL ESTIMATION
    # ----------------------------------------------------------
    "DepthAnythingV2Preprocessor":      "models/depthanything/",
    "MiDaS-DepthMapPreprocessor":       "models/midas/",
    "LeReS-DepthMapPreprocessor":       "models/leres/",
    "Zoe-DepthMapPreprocessor":         "models/zoe/",

    # ----------------------------------------------------------
    # POSE ESTIMATION
    # ----------------------------------------------------------
    "DWPreprocessor":                   "models/dwpose/",
    "OpenposePreprocessor":             "models/openpose/",

    # ----------------------------------------------------------
    # ANIMATEDIFF
    # ----------------------------------------------------------
    "ADE_LoadAnimateDiffModel":         "models/animatediff_models/",
    "ADE_LoadMotionLora":               "models/animatediff_motion_lora/",

    # ----------------------------------------------------------
    # MOTION CTRL / VIDEO MODELS
    # ----------------------------------------------------------
    "MotionCtrlLoader":                 "models/motionctrl/",
    "SVD_img2vid_Conditioning":         "models/checkpoints/",

    # ----------------------------------------------------------
    # INPAINT
    # ----------------------------------------------------------
    "INPAINT_LoadInpaintModel":         "models/inpaint/",

    # ----------------------------------------------------------
    # LLM / MULTIMODAL
    # ----------------------------------------------------------
    "DownloadAndLoadFlorence2Model":    "models/LLM/",
    "Florence2ModelLoader":             "models/LLM/",

    # ----------------------------------------------------------
    # SPANDREL (upscaler generico)
    # ----------------------------------------------------------
    "SpandrelImageToImage":             "models/upscale_models/",

    # ----------------------------------------------------------
    # NODI SENZA MODELLO DA SCARICARE
    # (processing, utility, math, display — nessun file .pth)
    # ----------------------------------------------------------
    "VHS_LoadVideo":                    None,
    "VHS_VideoCombine":                 None,
    "VHS_VideoInfo":                    None,
    "VHS_BatchManager":                 None,
    "ImageScaleBy":                     None,
    "ImageScale":                       None,
    "ImageUpscaleWithModel":            None,  # usa UpscaleModelLoader
    "FaceRestoreCFWithModel":           None,  # usa FaceRestoreModelLoader
    "RIFE VFI":                         "models/rife/",
    "easy showAnything":                None,
    "easy mathFloat":                   None,
    "easy mathInt":                     None,
    "easy int":                         None,
    "IntToFloat":                       None,
    "FloatToInt":                       None,
    "KSampler":                         None,
    "CLIPTextEncode":                   None,
    "EmptyLatentImage":                 None,
    "LatentUpscale":                    None,
    "SaveImage":                        None,
    "PreviewImage":                     None,
    "LoadImage":                        None,
    "ImageInvert":                      None,
    "MarkdownNote":                     None,
    "Label (rgthree)":                  None,
    "Fast Groups Bypasser (rgthree)":   None,
}


# ============================================================
# Funzione di lookup
# ============================================================

def get_model_folder(node_type: str) -> str | None:
    """
    Dato il tipo di nodo ComfyUI, restituisce la cartella
    di destinazione del modello relativa alla root ComfyUI.
    Restituisce None se il nodo non richiede un modello da scaricare.
    Restituisce 'UNKNOWN' se il tipo di nodo non è nel mapping.
    """
    if node_type in NODE_TO_MODEL_FOLDER:
        return NODE_TO_MODEL_FOLDER[node_type]
    return "UNKNOWN"


# ============================================================
# Estrazione modelli da un workflow JSON
# ============================================================

def extract_models_from_workflow(workflow: dict) -> list[dict]:
    """
    Dato un workflow ComfyUI (dict parsed da JSON),
    restituisce la lista di modelli da scaricare con:
    - node_id
    - node_type
    - filename
    - destination_folder
    """
    results = []
    
    # Nodi che contengono il filename del modello in widgets_values[0]
    SINGLE_MODEL_NODES = {
        "CheckpointLoaderSimple", "CheckpointLoader",
        "UpscaleModelLoader", "VAELoader", "CLIPLoader",
        "CLIPVisionLoader", "UNETLoader", "LoraLoader",
        "LoraLoaderModelOnly", "ControlNetLoader",
        "FaceRestoreModelLoader", "IPAdapterModelLoader",
        "StyleModelLoader", "PhotoMakerLoader",
        "GLIGENLoader", "SAMLoader",
    }

    # Nodi RIFE: il filename è widgets_values[0]
    RIFE_NODES = {"RIFE VFI", "FILM VFI", "FLAVR VFI", "GMFSS Fortuna VFI"}

    for node in workflow.get("nodes", []):
        node_type = node.get("type", "")
        node_id = node.get("id")
        widgets = node.get("widgets_values", [])
        
        folder = get_model_folder(node_type)
        
        if folder is None or folder == "UNKNOWN":
            continue

        # Estrai filename
        filename = None

        if node_type in SINGLE_MODEL_NODES and widgets:
            filename = widgets[0] if isinstance(widgets, list) else None

        elif node_type in RIFE_NODES and isinstance(widgets, list) and widgets:
            filename = widgets[0]

        elif node_type == "DualCLIPLoader" and isinstance(widgets, list):
            # Due modelli CLIP
            for i, f in enumerate(widgets[:2]):
                results.append({
                    "node_id": node_id,
                    "node_type": node_type,
                    "filename": f,
                    "destination_folder": folder,
                })
            continue

        if filename and isinstance(filename, str) and (
            filename.endswith(".pth") or
            filename.endswith(".safetensors") or
            filename.endswith(".ckpt") or
            filename.endswith(".bin")
        ):
            results.append({
                "node_id": node_id,
                "node_type": node_type,
                "filename": filename,
                "destination_folder": folder,
            })

    return results


# ============================================================
# Esempio di utilizzo
# ============================================================

if __name__ == "__main__":
    import json, sys

    if len(sys.argv) < 2:
        print("Uso: python comfyui_node_model_mapping.py workflow.json")
        sys.exit(1)

    with open(sys.argv[1]) as f:
        workflow = json.load(f)

    models = extract_models_from_workflow(workflow)

    print(f"\nModelli trovati nel workflow: {len(models)}\n")
    print(f"{'Nodo':<35} {'File':<40} {'Cartella destinazione'}")
    print("-" * 110)
    for m in models:
        print(f"{m['node_type']:<35} {m['filename']:<40} {m['destination_folder']}")
