# Code Review — upscale_runpod_comfyui
Data: 2026-03-06

---

## Riepilogo

| Priorita | Trovati | Corretti | Aperti |
|----------|---------|----------|--------|
| CRITICO  | 3       | 2        | 1      |
| MEDIO    | 4       | 4        | 0      |
| BASSO    | 4       | 0        | 4      |

---

## BUG CRITICI

---

### BUG-01 — `api_server.py`: workflow inviato a ComfyUI senza conversione UI→API — CORRETTO

**File:** `api_server.py`
**Stato:** CORRETTO (commit `8e3ee57`)

Il file `Video-Upscaler-RealESRGAN.json` e' in formato UI (struttura `{nodes: [...], links: [...], groups: [...]}`).
`api_server.py` lo caricava e lo inviava direttamente a ComfyUI tramite `POST /prompt` senza conversione in formato API (dizionario piatto `{node_id: {class_type, inputs}}`). ComfyUI si aspetta il formato API e rifiutava la richiesta con errore 400/422.

**Fix applicato:** Aggiunta funzione `load_api_workflow()` che rileva automaticamente il formato del workflow (UI vs API) e, se necessario, lo converte chiamando `convert_workflow.py`. Aggiunta anche `strip_meta()` per rimuovere `_meta` prima dell'invio a ComfyUI.

---

### BUG-02 — `api_server.py`: `patch_workflow` locale incompatibile con formato API — CORRETTO

**File:** `api_server.py`
**Stato:** CORRETTO (commit `8e3ee57`)

La funzione `patch_workflow` in `api_server.py` operava sul formato UI del workflow (leggeva `workflow.get("nodes", [])` e modificava `widgets_values`). I parametri della richiesta (video, risoluzione, interpolazione) non venivano mai applicati al workflow.

**Fix applicato:** Riscritta `patch_workflow` per operare sul formato API: cerca i nodi per `class_type` e `_meta.title`, gestisce l'interpolazione rimuovendo/mantenendo i nodi tramite `_meta.in_interpolation_group`. Stessa logica di `run_upscale.py`.

---

### BUG-03 — `.env` e `install.txt`: credenziali reali potenzialmente tracciate in git — APERTO

**File:** `.env`, `install.txt`
**Stato:** APERTO
**Impatto:** Esposizione di HF_TOKEN e API_TOKEN.

Entrambi i file contengono token reali (HF_TOKEN e API_TOKEN in chiaro).

Entrambi i file sono elencati nel `.gitignore`, il che impedisce future aggiunte. Tuttavia, se i file erano gia' tracciati in un commit precedente prima che venissero aggiunti al `.gitignore`, le credenziali sono visibili nella storia git (e quindi su GitHub se il repo e' stato pushato).

**Verifica:** Eseguire `git log --all --full-history -- .env install.txt` per verificare se questi file siano mai stati committati. Se si, i token vanno revocati e rigenerati immediatamente.

**Correzione consigliata:**
1. Revocare i token su HuggingFace e rigenerare `API_TOKEN`.
2. Se i file sono in git history: eseguire `git filter-repo` per rimuoverli dalla storia.
3. Usare `.env.example` con valori placeholder per la documentazione.

---

## BUG MEDI

---

### BUG-04 — `api_server.py`: ID nodi interpolazione hardcodati — CORRETTO

**File:** `api_server.py`
**Stato:** CORRETTO (commit `8e3ee57`)

La vecchia `patch_workflow` usava `INTERPOLATION_NODE_IDS = {41, 42, 43, 44, 46, 47}` hardcodati. Se il workflow veniva modificato, l'interpolazione veniva gestita sui nodi sbagliati.

**Fix applicato:** La nuova `patch_workflow` usa `_meta.in_interpolation_group` (impostato da `convert_workflow.py`) per identificare i nodi di interpolazione. Funziona con qualsiasi workflow.

---

### BUG-05 — `api_server.py`: `asyncio.Semaphore` creato prima del loop asyncio — CORRETTO

**File:** `api_server.py`
**Stato:** CORRETTO (commit `8e3ee57`)

`asyncio.Semaphore(MAX_CONCURRENT)` veniva creato a livello di modulo, prima che uvicorn avviasse il loop asyncio. Questo causa `DeprecationWarning` in Python 3.10+ e possibili errori in 3.12+.

**Fix applicato:** Il semaforo viene ora inizializzato in `@app.on_event("startup")`.

---

### BUG-06 — `api_server.py`: `asyncio.get_event_loop()` deprecato — CORRETTO

**File:** `api_server.py`
**Stato:** CORRETTO (commit `8e3ee57`)

`asyncio.get_event_loop()` e' deprecato dall'interno di una coroutine in Python 3.10+.

**Fix applicato:** Sostituito con `asyncio.get_running_loop()`.

---

### BUG-07 — `install_workflow_dependencies.py`: `resolve_node_github_url` restituisce `install_type` — CORRETTO

**File:** `install_workflow_dependencies.py`
**Stato:** CORRETTO (commit `8e3ee57`)

La funzione poteva restituire `entry.get("install_type")` (es. la stringa `"git-clone"`) come URL, facendo fallire `git clone` con un errore confuso.

**Fix applicato:** La funzione ora restituisce `reference` solo se inizia con `"http"`.

---

## BUG BASSI (aperti)

---

### BUG-08 — `comfyui_node_model_mapping.py`: chiavi duplicate nel dizionario

**File:** `comfyui_node_model_mapping.py` — righe 77, 82, 193, 194
**Impatto:** Comportamento diverso da quello documentato per `FaceRestoreCFWithModel`.

Due nodi hanno definizioni duplicate (in Python l'ultima sovrascrive la prima):

- `"FaceRestoreCFWithModel"`: definito a riga 77 come `"models/facerestore_models/"` e a riga 193 come `None`. Il valore finale e' `None` (corretto funzionalmente, ma la prima riga e' fuorviante).
- `"RIFE VFI"`: definito a riga 82 e a riga 194, entrambi `"models/rife/"` — ridondanza senza impatto funzionale.

---

### BUG-09 — `convert_workflow.py`: `inputs.pop("count", None)` e' un no-op

**File:** `convert_workflow.py` — riga 207
**Impatto:** Nessun effetto pratico, ma il commento e' fuorviante.

```python
if node_type == "VHS_BatchManager" and mode == 4:
    inputs.pop("count", None)
```

Dopo la conversione, `VHS_BatchManager` ha il campo `frames_per_batch` (come definito in `WIDGET_NAMES_OVERRIDE`), non `count`. Il `pop("count")` non rimuove nulla.

---

### BUG-10 — `run_upscale.py`: fallback `find_comfyui_path()` restituisce `None`

**File:** `run_upscale.py` — righe 38-40, 574
**Impatto:** Messaggio di errore confuso ("None/input/ not found") se l'import fallisce.

Se `from comfyui_detect import ...` lancia `ImportError`, viene usato il fallback:
```python
def find_comfyui_path(): return None
```

Poi a riga 574:
```python
comfyui_path = args.comfyui_path or str(find_comfyui_path())  # -> "None"
```

`str(None)` produce la stringa `"None"`, e tutte le operazioni sui path cercheranno `"None/input/"` invece di sollevare un errore chiaro.

---

### BUG-11 — `run_upscale.py`: import `subprocess` e `json` ridondanti dentro funzioni

**File:** `run_upscale.py` — righe 139, 154, 201
**Impatto:** Nessun impatto funzionale, solo rumore nel codice.

`subprocess` e' gia' importato a livello modulo (riga 23). Viene reimportato inutilmente dentro `get_available_vram_mb` (righe 139, 154). Analogamente `json` e' gia' importato a livello modulo ma viene reimportato dentro `get_video_info` (riga 201).

---

## Note aggiuntive

### `README.txt` — percorso ComfyUI incoerente
Le istruzioni nella prima parte del `README.txt` assumono ComfyUI in `/workspace/ComfyUI`, mentre nella parte finale si specifica che il percorso corretto per RunPod slim e' `/workspace/runpod-slim/ComfyUI`. Il file `comfyui_detect.py` ha gia' `/workspace/runpod-slim/ComfyUI` come primo path di ricerca, quindi il comportamento automatico e' corretto — ma le istruzioni manuali nella prima parte del README sono obsolete.

### `setup.sh` — funziona correttamente
Il setup automatico e' logicamente corretto: il venv e' attivato prima dell'installazione delle dipendenze, `install_workflow_dependencies.py` viene eseguito con il python del venv, e l'API server viene avviato con il python del venv attraverso `source`. Non ci sono bug funzionali.

### `comfyui_detect.py` — parsing `.env` senza gestione virgolette
Il parser `.env` non gestisce valori quoted (es. `API_TOKEN="valore"`). Con i valori attuali (senza virgolette) non e' un problema, ma e' un limite da tenere presente.

---

## Interventi rimanenti (priorita' consigliata)

1. **(CRITICO)** BUG-03: Revocare e rigenerare `HF_TOKEN` e `API_TOKEN` se presenti in git history.
2. **(BASSO)** BUG-08: Rimuovere chiavi duplicate da `comfyui_node_model_mapping.py`.
3. **(BASSO)** BUG-09: Rimuovere `inputs.pop("count", None)` da `convert_workflow.py`.
4. **(BASSO)** BUG-10: Gestire fallback `find_comfyui_path()` con errore esplicito in `run_upscale.py`.
5. **(BASSO)** BUG-11: Rimuovere import ridondanti da `run_upscale.py`.
6. **(BASSO)** Aggiornare `README.txt` con i path corretti.
