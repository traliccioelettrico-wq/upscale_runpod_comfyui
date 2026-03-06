# Code Review — upscale_runpod_comfyui
Data: 2026-03-06

---

## Riepilogo

| Priorità | N. bug/problemi |
|----------|-----------------|
| CRITICO  | 3               |
| MEDIO    | 4               |
| BASSO    | 4               |

---

## BUG CRITICI

---

### BUG-01 — `api_server.py`: workflow inviato a ComfyUI senza conversione UI→API

**File:** `api_server.py` — righe 433–442 e `process_job_sync` riga 247
**Impatto:** Il server API non funziona per il suo scopo principale.

Il file `Video-Upscaler-RealESRGAN.json` è in formato UI (struttura `{nodes: [...], links: [...], groups: [...]}`).
In `api_server.py`, il workflow viene caricato e patchato con la funzione locale `patch_workflow` che lo legge correttamente come formato UI, ma poi viene inviato **direttamente** a ComfyUI tramite `POST /prompt` senza conversione in formato API (dizionario piatto `{node_id: {class_type, inputs}}`).

ComfyUI si aspetta il formato API su `POST /prompt`. Inviare il formato UI causa un errore 400/422.

`run_upscale.py` gestisce correttamente questo problema: usa `resolve_api_workflow` + `convert_workflow.py` per ottenere il formato API prima di inviare. `api_server.py` non ha questo step.

**Correzione:** Prima di inviare a ComfyUI, convertire il workflow con `convert_workflow.py` oppure usare la stessa logica di `resolve_api_workflow` già presente in `run_upscale.py`. In alternativa, fare in modo che `WORKFLOW_PATH` punti sempre al file `-API.json` già convertito, e usare la `patch_workflow` di `run_upscale.py` invece di quella locale.

---

### BUG-02 — `api_server.py`: `patch_workflow` locale incompatibile con il formato che arriva a ComfyUI

**File:** `api_server.py` — righe 168–197
**Impatto:** Nessun parametro (video di input, risoluzione target, interpolazione) viene applicato al workflow prima dell'invio.

La funzione `patch_workflow` in `api_server.py` opera sul formato UI del workflow (legge `workflow.get("nodes", [])` e modifica `widgets_values`). Se il workflow da inviare a ComfyUI fosse già in formato API (dizionario piatto), questa funzione non troverebbe alcun nodo da modificare e il workflow verrebbe inviato con i valori di default.

Questo significa che anche risolvendo BUG-01 (conversione al formato API), i parametri della richiesta (video_url, target_height, interpolate) non verrebbero applicati correttamente.

La funzione `patch_workflow` corretta per il formato API è già scritta in `run_upscale.py` (righe 290–369): opera sul dizionario piatto, cerca i nodi per `class_type` e `_meta.title`, gestisce l'interpolazione rimuovendo i nodi appropriati.

**Correzione:** Sostituire la `patch_workflow` di `api_server.py` con quella di `run_upscale.py`, oppure importarla direttamente come modulo condiviso.

---

### BUG-03 — `.env` e `install.txt`: credenziali reali potenzialmente tracciate in git

**File:** `.env`, `install.txt`
**Impatto:** Esposizione di HF_TOKEN e API_TOKEN.

Entrambi i file contengono token reali (HF_TOKEN e API_TOKEN in chiaro).

Entrambi i file sono elencati nel `.gitignore`, il che impedisce future aggiunte. Tuttavia, se i file erano già tracciati in un commit precedente prima che venissero aggiunti al `.gitignore`, le credenziali sono visibili nella storia git (e quindi su GitHub se il repo è stato pushato).

**Verifica:** Eseguire `git log --all --full-history -- .env install.txt` per verificare se questi file siano mai stati committati. Se sì, i token vanno revocati e rigenerati immediatamente.

**Correzione:**
1. Revocare i token su HuggingFace e rigenerare `API_TOKEN`.
2. Se i file sono in git history: eseguire `git filter-branch` o `git filter-repo` per rimuoverli dalla storia.
3. Usare `.env.example` con valori placeholder per la documentazione.

---

## BUG MEDI

---

### BUG-04 — `api_server.py`: ID nodi interpolazione hardcodati

**File:** `api_server.py` — riga 193
**Impatto:** Rottura se il workflow cambia o si usa un workflow diverso.

```python
INTERPOLATION_NODE_IDS = {41, 42, 43, 44, 46, 47}
```

Questa lista di ID è hardcodata nella funzione `patch_workflow` di `api_server.py`. Se il workflow viene modificato (aggiunto/rimosso un nodo, cambiati gli ID), l'interpolazione viene abilitata/disabilitata sui nodi sbagliati.

`run_upscale.py` risolve questo in modo generico: usa `_meta.in_interpolation_group` che viene impostato durante la conversione in `convert_workflow.py` e funziona con qualsiasi workflow.

---

### BUG-05 — `api_server.py`: `asyncio.Semaphore` creato prima del loop asyncio

**File:** `api_server.py` — riga 73
**Impatto:** `DeprecationWarning` in Python 3.10+, possibile errore in Python 3.12+.

```python
semaphore = asyncio.Semaphore(MAX_CONCURRENT)  # a livello modulo
```

`asyncio.Semaphore` deve essere creato all'interno di un loop asyncio attivo. Crearlo a livello di modulo, prima che uvicorn avvii il suo loop, può causare comportamenti imprevisti.

**Correzione:** Inizializzare il semaforo in un evento di startup di FastAPI:
```python
@app.on_event("startup")
async def startup():
    global semaphore
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
```

---

### BUG-06 — `api_server.py`: `asyncio.get_event_loop()` deprecato

**File:** `api_server.py` — riga 347
**Impatto:** `DeprecationWarning` in Python 3.10+.

```python
loop = asyncio.get_event_loop()
await loop.run_in_executor(...)
```

`asyncio.get_event_loop()` è deprecato dall'interno di una coroutine. Bisogna usare `asyncio.get_running_loop()`.

---

### BUG-07 — `install_workflow_dependencies.py`: `resolve_node_github_url` può restituire `install_type` invece di un URL

**File:** `install_workflow_dependencies.py` — righe 228–229
**Impatto:** `git clone` fallisce con un errore confuso.

```python
return entry.get("reference") or entry.get("install_type")
```

Nel database di ComfyUI Manager, `install_type` può valere `"git-clone"`, `"pip"`, `"copy"` — non è un URL. Se `reference` è `None` e `install_type` è `"git-clone"`, la funzione restituisce la stringa `"git-clone"`, che viene poi passata come URL a `git clone`, causando un errore.

**Correzione:** Restituire solo `entry.get("reference")` oppure verificare che il valore restituito inizi con `"https://"` prima di usarlo.

---

## BUG BASSI

---

### BUG-08 — `comfyui_node_model_mapping.py`: chiavi duplicate nel dizionario

**File:** `comfyui_node_model_mapping.py` — righe 77, 82, 193, 194
**Impatto:** Comportamento diverso da quello documentato per `FaceRestoreCFWithModel`.

Due nodi hanno definizioni duplicate (in Python l'ultima sovrascrive la prima):

- `"FaceRestoreCFWithModel"`: definito a riga 77 come `"models/facerestore_models/"` e a riga 193 come `None`. Il valore finale è `None` (corretto funzionalmente, ma la prima riga è fuorviante).
- `"RIFE VFI"`: definito a riga 82 e a riga 194, entrambi `"models/rife/"` — ridondanza senza impatto funzionale.

---

### BUG-09 — `convert_workflow.py`: `inputs.pop("count", None)` è un no-op

**File:** `convert_workflow.py` — riga 207
**Impatto:** Nessun effetto pratico, ma il commento è fuorviante.

```python
if node_type == "VHS_BatchManager" and mode == 4:
    inputs.pop("count", None)
```

Dopo la conversione, `VHS_BatchManager` ha il campo `frames_per_batch` (come definito in `WIDGET_NAMES_OVERRIDE`), non `count`. Il `pop("count")` non rimuove nulla. Il campo identico esiste anche in `run_upscale.py` (riga 327) dove però è giustificato come "ComfyUI lo ricalcola automaticamente" — probabilmente è un residuo di una versione precedente.

---

### BUG-10 — `run_upscale.py`: fallback `find_comfyui_path()` restituisce `None`

**File:** `run_upscale.py` — righe 38–40, 574
**Impatto:** Messaggio di errore confuso ("None/input/ not found") se l'import fallisce.

Se `from comfyui_detect import ...` lancia `ImportError`, viene usato il fallback:
```python
def find_comfyui_path(): return None
```

Poi a riga 574:
```python
comfyui_path = args.comfyui_path or str(find_comfyui_path())  # → "None"
```

`str(None)` produce la stringa `"None"`, e tutte le operazioni sui path (upload, copia output) cercheranno `"None/input/"` e `"None/output/"` invece di sollevare un errore chiaro.

---

### BUG-11 — `run_upscale.py`: import `subprocess` e `json` ridondanti dentro funzioni

**File:** `run_upscale.py` — righe 139, 154, 201
**Impatto:** Nessun impatto funzionale, solo rumore nel codice.

`subprocess` è già importato a livello modulo (riga 23). Viene reimportato inutilmente dentro `get_available_vram_mb` (righe 139, 154). Analogamente `json` è già importato a livello modulo ma viene reimportato dentro `get_video_info` (riga 201).

---

## Note aggiuntive

### `README.txt` — percorso ComfyUI incoerente
Le istruzioni nella prima parte del `README.txt` assumono ComfyUI in `/workspace/ComfyUI`, mentre nella parte finale (aggiunta successivamente) si specifica che il percorso corretto per RunPod slim è `/workspace/runpod-slim/ComfyUI`. Il file `comfyui_detect.py` ha già `/workspace/runpod-slim/ComfyUI` come primo path di ricerca, quindi il comportamento automatico è corretto — ma le istruzioni manuali nella prima parte del README sono obsolete.

### `setup.sh` — funziona correttamente
Il setup automatico è logicamente corretto: il venv è attivato prima dell'installazione delle dipendenze, `install_workflow_dependencies.py` viene eseguito con il python del venv, e l'API server viene avviato con il python del venv attraverso `source`. Non ci sono bug funzionali.

### `comfyui_detect.py` — parsing `.env` senza gestione virgolette
Il parser `.env` non gestisce valori quoted (es. `API_TOKEN="valore"`). Con i valori attuali (senza virgolette) non è un problema, ma è un limite da tenere presente.

---

## Ordine di priorità interventi

1. **(CRITICO)** Revocare e rigenerare `HF_TOKEN` e `API_TOKEN` se presenti in git history.
2. **(CRITICO)** Correggere `api_server.py` per convertire il workflow in formato API prima dell'invio a ComfyUI e usare la `patch_workflow` compatibile con il formato API.
3. **(MEDIO)** Eliminare gli ID hardcodati `INTERPOLATION_NODE_IDS` da `api_server.py`.
4. **(MEDIO)** Correggere `asyncio.Semaphore` e `asyncio.get_event_loop()` in `api_server.py`.
5. **(MEDIO)** Correggere `resolve_node_github_url` per non restituire `install_type`.
6. **(BASSO)** Rimuovere chiavi duplicate da `comfyui_node_model_mapping.py`.
7. **(BASSO)** Aggiornare `README.txt` con i path corretti (`/workspace/runpod-slim/ComfyUI`).
