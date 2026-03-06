#!/usr/bin/env python3
"""
convert_workflow.py
-------------------
Converte un workflow ComfyUI dal formato UI (grafico, con nodes/links)
al formato API (dizionario piatto {node_id: {class_type, inputs}})
richiesto dall'endpoint POST /prompt.

Funziona con QUALSIASI workflow ComfyUI — nessun ID hardcodato.

Uso:
    python3 convert_workflow.py input_ui.json output_api.json
    python3 convert_workflow.py input_ui.json output_api.json --validate

Convenzioni sui titoli dei nodi (usati da run_upscale.py):
    - Nodo con title "Target Resolution"  -> altezza target upscaling
    - Nodo con title "FPS Multiplier"     -> moltiplicatore fps interpolazione
    - Nodo VHS_LoadVideo                  -> video di input (trovato per class_type)
    - Gruppo con title "Interpolation"    -> nodi da bypassare se interpolazione OFF
"""

import json
import sys
import requests
from pathlib import Path

COMFYUI_URL = "http://127.0.0.1:8188"

SKIP_NODE_TYPES = {
    "Label (rgthree)",
    "MarkdownNote",
    "Fast Groups Bypasser (rgthree)",
    "Note",
}

WIDGET_NAMES_OVERRIDE = {
    "VHS_LoadVideo": [
        "video", "force_rate", "custom_width", "custom_height",
        "frame_load_cap", "skip_first_frames", "select_every_nth",
        "format", "choose video to upload"
    ],
    "VHS_VideoCombine": [
        "frame_rate", "loop_count", "filename_prefix", "format",
        "pix_fmt", "crf", "save_metadata", "trim_to_audio",
        "pingpong", "save_output"
    ],
    "RIFE VFI": [
        "ckpt_name", "clear_cache_after_n_frames", "multiplier",
        "fast_mode", "ensemble", "scale_factor"
    ],
    "UpscaleModelLoader":    ["model_name"],
    "ImageScaleBy":          ["upscale_method", "scale_by"],
    "easy mathFloat":        ["a", "b", "operation"],
    "easy mathInt":          ["a", "b", "operation"],
    "easy int":              ["value"],
    "easy float":            ["value"],
    "easy showAnything":     [],
    "IntToFloat":            [],
    "FloatToInt":            ["rounding"],
    "VHS_BatchManager":      ["frames_per_batch"],
    "VHS_VideoInfo":         [],
    "ImageUpscaleWithModel": [],
}


def get_object_info(node_type):
    try:
        resp = requests.get(f"{COMFYUI_URL}/object_info/{node_type}", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            node_info = data.get(node_type, {})
            required = node_info.get("input", {}).get("required", {})
            optional = node_info.get("input", {}).get("optional", {})
            return {**required, **optional}
    except Exception:
        pass
    return {}


def get_widget_names_from_info(obj_info):
    widget_names = []
    for name, type_info in obj_info.items():
        if isinstance(type_info, list) and len(type_info) >= 1:
            type_val = type_info[0]
            options  = type_info[1] if len(type_info) > 1 else {}
            if isinstance(type_val, str) and type_val in ("INT", "FLOAT", "STRING", "BOOLEAN"):
                if not (isinstance(options, dict) and options.get("forceInput")):
                    widget_names.append(name)
    return widget_names


def find_interpolation_node_ids(nodes, groups):
    """
    Trova gli ID dei nodi nel gruppo Interpolation.
    Cerca per bounding box del gruppo, poi fallback su nodi mode=4.
    """
    for group in groups:
        title = group.get("title", "").lower()
        if "interpolat" in title:
            # Prova con nodi espliciti nel gruppo
            group_nodes = group.get("nodes", [])
            if group_nodes:
                return {str(n) for n in group_nodes}

            # Identifica per bounding box
            bounding = group.get("bounding", [])
            if len(bounding) == 4:
                gx, gy, gw, gh = bounding
                ids = set()
                for node in nodes:
                    pos = node.get("pos", [0, 0])
                    nx = pos[0] if isinstance(pos, list) else pos.get("0", 0)
                    ny = pos[1] if isinstance(pos, list) else pos.get("1", 0)
                    if gx <= nx <= gx + gw and gy <= ny <= gy + gh:
                        ids.add(str(node["id"]))
                if ids:
                    return ids

    # Fallback: tutti i nodi bypassed non decorativi
    return {
        str(n["id"]) for n in nodes
        if n.get("mode") == 4 and n.get("type") not in SKIP_NODE_TYPES
    }


def convert_workflow(workflow_path, output_path):
    with open(workflow_path) as f:
        wf = json.load(f)

    nodes  = wf.get("nodes", [])
    links  = wf.get("links", [])
    groups = wf.get("groups", [])

    # link_id -> [src_node_id, src_output_slot]
    link_map = {
        link[0]: [str(link[1]), link[2]]
        for link in links
    }

    interpolation_ids    = find_interpolation_node_ids(nodes, groups)
    referenced_src_nodes = {str(link[1]) for link in links}
    object_info_cache    = {}
    api                  = {}

    for node in nodes:
        node_id   = str(node["id"])
        node_type = node.get("type", "")
        mode      = node.get("mode", 0)
        title     = node.get("title", "")

        if node_type in SKIP_NODE_TYPES:
            continue
        if mode == 4 and node_id not in referenced_src_nodes:
            continue

        if node_type not in object_info_cache:
            object_info_cache[node_type] = get_object_info(node_type)
        obj_info = object_info_cache[node_type]

        inputs = {}

        # Connessioni via link
        connected_input_names = []
        for inp in node.get("inputs", []):
            inp_name = inp.get("name")
            link_id  = inp.get("link")
            if link_id is not None and link_id in link_map:
                inputs[inp_name] = link_map[link_id]
                connected_input_names.append(inp_name)

        # Widgets values
        widgets_raw = node.get("widgets_values", [])

        if isinstance(widgets_raw, dict):
            for k, v in widgets_raw.items():
                if k in ("videopreview", "hidden", "paused", "params"):
                    continue
                if k not in connected_input_names:
                    inputs[k] = v

        elif isinstance(widgets_raw, list):
            widget_names = WIDGET_NAMES_OVERRIDE.get(node_type)

            if widget_names is not None:
                widget_idx = 0
                for wname in widget_names:
                    if widget_idx >= len(widgets_raw):
                        break
                    if wname in connected_input_names:
                        widget_idx += 1
                        continue
                    inputs[wname] = widgets_raw[widget_idx]
                    widget_idx += 1
            else:
                available = [
                    n for n in get_widget_names_from_info(obj_info)
                    if n not in connected_input_names
                ]
                for i, val in enumerate(widgets_raw):
                    if i < len(available):
                        inputs[available[i]] = val
                    else:
                        inputs[f"widget_{i}"] = val

        # VHS_BatchManager bypassed: rimuovi count residuo (frames_per_batch calcolato da run_upscale.py)
        if node_type == "VHS_BatchManager" and mode == 4:
            inputs.pop("count", None)

        api[node_id] = {
            "class_type": node_type,
            "inputs": inputs,
            "_meta": {
                "title": title or node_type,
                "in_interpolation_group": node_id in interpolation_ids,
            },
        }

    with open(output_path, "w") as f:
        json.dump(api, f, indent=2)

    print(f"Conversione completata!")
    print(f"   Nodi totali nel workflow UI: {len(nodes)}")
    print(f"   Nodi convertiti nell'API:    {len(api)}")
    print(f"   Nodi gruppo interpolazione:  {len(interpolation_ids)} {sorted(interpolation_ids)}")
    print(f"   Output: {output_path}")
    print()
    print("Nodi convertiti:")
    for nid, ndata in api.items():
        interp = " [INTERPOLATION]" if ndata["_meta"]["in_interpolation_group"] else ""
        print(f"  [{nid}] {ndata['class_type']} title='{ndata['_meta']['title']}'{interp}")

    return api


def validate_against_comfyui(api_path):
    print()
    print("Validazione contro ComfyUI...")

    with open(api_path) as f:
        api = json.load(f)

    api_clean = {
        nid: {k: v for k, v in ndata.items() if k != "_meta"}
        for nid, ndata in api.items()
    }

    try:
        resp = requests.post(
            f"{COMFYUI_URL}/prompt",
            json={"prompt": api_clean, "client_id": "convert_test"},
            timeout=10
        )
        data = resp.json()

        if resp.status_code == 200 and "prompt_id" in data:
            print(f"Workflow valido! prompt_id: {data['prompt_id']}")
            requests.post(f"{COMFYUI_URL}/queue", json={"delete": [data["prompt_id"]]})
            return True
        else:
            print(f"Errore validazione (HTTP {resp.status_code}):")
            if "error" in data:
                print(f"   {data['error'].get('type')}: {data['error'].get('message')} — {data['error'].get('details')}")
            if "node_errors" in data and data["node_errors"]:
                for nid, nerr in data["node_errors"].items():
                    for e in nerr.get("errors", []):
                        print(f"   Nodo {nid} ({nerr.get('class_type','')}): {e.get('details', e.get('message',''))}")
            return False
    except Exception as e:
        print(f"Errore connessione ComfyUI: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python3 convert_workflow.py input_ui.json output_api.json [--validate]")
        sys.exit(1)

    input_file  = sys.argv[1]
    output_file = sys.argv[2]
    do_validate = "--validate" in sys.argv

    if not Path(input_file).exists():
        print(f"File non trovato: {input_file}")
        sys.exit(1)

    convert_workflow(input_file, output_file)

    if do_validate:
        validate_against_comfyui(output_file)
