#!/usr/bin/env python3
"""
bowie-benchmark.py — Benchmark singolo modello Bowie candidato
Usage: python3 scripts/bowie-benchmark.py <model_name> [--skip-rm]
Output: appende JSON a logs/bowie-benchmark-raw.jsonl
"""
import sys
import os
import json
import re
import subprocess
import time
import tempfile

MODEL = sys.argv[1] if len(sys.argv) > 1 else None
SKIP_RM = "--skip-rm" in sys.argv
RESULTS_FILE = "logs/bowie-benchmark-raw.jsonl"

if not MODEL:
    print("ERROR: model argument required", file=sys.stderr)
    sys.exit(1)

# Protected models — never ollama rm
PROTECTED = {"qwen3:1.7b","qwen3:4b","qwen3:14b","bikerlink:latest","bikerlink-routing:latest"}

# ─── Env vars ────────────────────────────────────────────────────────────────
OLLAMA_URL = os.environ.get("HORUS_OLLAMA_URL","").rstrip("/")
CF_ID      = os.environ.get("CF_ACCESS_CLIENT_ID","")
CF_SECRET  = os.environ.get("CF_ACCESS_CLIENT_SECRET","")
OLLAMA_TOK = os.environ.get("HORUS_OLLAMA_TOKEN","")

if not OLLAMA_URL or not CF_ID or not CF_SECRET:
    print("ERROR: HORUS_OLLAMA_URL / CF_ACCESS_* missing", file=sys.stderr)
    sys.exit(1)

CF_HEADERS = [
    "-H", f"CF-Access-Client-Id: {CF_ID}",
    "-H", f"CF-Access-Client-Secret: {CF_SECRET}",
    "-H", f"Authorization: Bearer {OLLAMA_TOK}",
]

# ─── Helpers ─────────────────────────────────────────────────────────────────

def tc_exec(cmd, sudo=False):
    """Run command on ThinkCentre via SSH."""
    args = ["python3", ".agents/skills/thinkcentre-access/tc.py", "exec", cmd]
    if sudo:
        args.append("--sudo")
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=30)
        out = r.stdout + r.stderr
        # Filter SSH warnings
        lines = [l for l in out.splitlines() if "Warning:" not in l and "known hosts" not in l]
        return "\n".join(lines).strip()
    except Exception as e:
        return f"ERROR: {e}"

def vram_read():
    """Return (used_mb, free_mb, temp_c, gpu_pct) or None."""
    raw = tc_exec("nvidia-smi --query-gpu=memory.used,memory.free,temperature.gpu,utilization.gpu --format=csv,noheader,nounits")
    try:
        parts = [p.strip() for p in raw.split(",")]
        return int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
    except Exception:
        return None

def parse_ndjson_stream(data: str) -> str:
    """Parse Ollama NDJSON stream, strip think tags, return text."""
    chunks = []
    for line in data.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
            # /api/chat format
            chunk = d.get("message", {}).get("content", "") or ""
            # /api/generate format
            if not chunk:
                chunk = d.get("response", "") or ""
            if chunk:
                chunks.append(chunk)
        except Exception:
            pass
    text = "".join(chunks)
    # Strip think tags
    text = re.sub(r"<think>[\s\S]*?</think>", "", text)
    text = re.sub(r"^[\s\S]*?</think>\s*", "", text)
    # Strip English leakage lines at start
    lines = text.split("\n")
    while lines and re.match(r"^(Okay,|Sure,|Let me|Alright,|Of course,)", lines[0].strip()):
        lines.pop(0)
    return "\n".join(lines).strip()

def call_model(model: str, messages: list, num_predict: int = 400, timeout: int = 90) -> tuple[str, int]:
    """Call model via /api/chat streaming. Returns (response_text, latency_ms)."""
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "stream": True,
        "think": False,
        "options": {"num_predict": num_predict}
    })
    with tempfile.NamedTemporaryFile(delete=False, suffix=".ndjson") as f:
        tmpfile = f.name
    
    t_start = time.monotonic()
    try:
        r = subprocess.run(
            ["curl", "-s", "--no-buffer", "--max-time", str(timeout),
             *CF_HEADERS,
             "-H", "Content-Type: application/json",
             "-d", payload,
             f"{OLLAMA_URL}/api/chat",
             "-o", tmpfile],
            capture_output=True, timeout=timeout + 5
        )
        t_end = time.monotonic()
        lat_ms = int((t_end - t_start) * 1000)
        
        with open(tmpfile, "r", errors="replace") as f:
            raw = f.read()
        os.unlink(tmpfile)
        
        text = parse_ndjson_stream(raw)
        return text, lat_ms
    except Exception as e:
        try: os.unlink(tmpfile)
        except: pass
        return f"ERROR: {e}", 0

def load_model(model: str, keep_alive: int = 300):
    """Warm up model."""
    payload = json.dumps({
        "model": model, "prompt": "ciao", "stream": True,
        "keep_alive": keep_alive, "options": {"num_predict": 1}
    })
    with tempfile.NamedTemporaryFile(delete=False) as f:
        tmpfile = f.name
    try:
        subprocess.run(
            ["curl", "-s", "--no-buffer", "--max-time", "120",
             *CF_HEADERS,
             "-H", "Content-Type: application/json",
             "-d", payload,
             f"{OLLAMA_URL}/api/generate",
             "-o", tmpfile],
            timeout=125
        )
    except Exception:
        pass
    finally:
        try: os.unlink(tmpfile)
        except: pass

def unload_model(model: str):
    payload = json.dumps({
        "model": model, "prompt": "x", "stream": True,
        "keep_alive": 0, "options": {"num_predict": 1}
    })
    with tempfile.NamedTemporaryFile(delete=False) as f:
        tmpfile = f.name
    try:
        subprocess.run(
            ["curl", "-s", "--no-buffer", "--max-time", "30",
             *CF_HEADERS,
             "-H", "Content-Type: application/json",
             "-d", payload,
             f"{OLLAMA_URL}/api/generate",
             "-o", tmpfile],
            timeout=35
        )
    except Exception:
        pass
    finally:
        try: os.unlink(tmpfile)
        except: pass

def pin_horus():
    load_model("qwen3:4b", keep_alive=-1)

def check_horus_alive() -> bool:
    try:
        with tempfile.NamedTemporaryFile(delete=False) as f:
            tmpfile = f.name
        subprocess.run(
            ["curl", "-s", "--max-time", "10",
             *CF_HEADERS,
             f"{OLLAMA_URL}/api/ps",
             "-o", tmpfile],
            timeout=15
        )
        with open(tmpfile, "r") as f:
            d = json.load(f)
        os.unlink(tmpfile)
        loaded = [m["name"] for m in d.get("models", [])]
        print(f"  [ps] Loaded: {loaded}")
        return "qwen3:4b" in loaded
    except Exception as e:
        print(f"  [ps] ERROR: {e}")
        return False

def restore_horus():
    if not check_horus_alive():
        print("  [WARN] Horus missing! Restoring...")
        pin_horus()
        time.sleep(5)
        ok = check_horus_alive()
        print(f"  [restore] After restore: {'ok' if ok else 'STILL MISSING'}")
    else:
        print("  [ok] Horus in VRAM.")

def rm_model(model: str):
    """Remove model from disk via Ollama API DELETE."""
    payload = json.dumps({"model": model})
    try:
        r = subprocess.run(
            ["curl", "-s", "--max-time", "15", "-X", "DELETE",
             *CF_HEADERS,
             "-H", "Content-Type: application/json",
             "-d", payload,
             f"{OLLAMA_URL}/api/delete"],
            capture_output=True, text=True, timeout=20
        )
        print(f"  [rm] {model}: {r.stdout[:80] or r.stderr[:80] or 'ok'}")
    except Exception as e:
        print(f"  [rm] ERROR: {e}")

def extract_json(text: str) -> dict:
    """Extract first JSON object from text, handling nested braces."""
    # Try full parse first
    try:
        return json.loads(text.strip())
    except Exception:
        pass
    # Find JSON object with proper brace matching
    start = text.find("{")
    if start == -1:
        return {}
    depth = 0
    for i, ch in enumerate(text[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i+1])
                except Exception:
                    break
    return {}

# ─── Scoring helpers ──────────────────────────────────────────────────────────

def score_relevance(text: str, keywords: list[str]) -> int:
    """Score 1 if response is non-empty Italian text relevant to keywords."""
    if not text or len(text.strip()) < 10:
        return 0
    tl = text.lower()
    # Penalize refusals
    if any(w in tl for w in ["non posso", "impossibile rispondere", "non sono in grado"]):
        return 0
    # Penalize English-dominant responses
    eng = sum(1 for w in ["hello", "sorry", "cannot", "please", "this is", "your "] if w in tl)
    it = sum(1 for w in ["ciao","grazie","puoi","hai","moto","app","bikerlink","viaggio",
                          "cerca","trova","ducati","palermo","compagni","profil",
                          "posso","come","non ","per ","che ","del ","della "] if w in tl)
    if eng > it and eng > 3:
        return 0
    # At least one keyword or sufficient Italian
    kw_hit = any(k.lower() in tl for k in keywords if k)
    return 1 if (kw_hit or it > 3) else 0

# ─── MAIN ─────────────────────────────────────────────────────────────────────

print(f"\n{'='*50}")
print(f"BENCHMARKING: {MODEL}")
print(f"{'='*50}")

# Step 0: Pin Horus
print("\n[0] Pinning Horus...")
pin_horus()

# Step 1: VRAM check
v = vram_read()
if v:
    used_mb, free_mb, temp_c, gpu_pct = v
    print(f"[vram] Pre-load: used={used_mb} free={free_mb} temp={temp_c}°C gpu={gpu_pct}%")
    if free_mb < 2000:
        print(f"[SKIP] VRAM free {free_mb} MB < 2000 MB — skip {MODEL}")
        with open(RESULTS_FILE, "a") as f:
            f.write(json.dumps({"model": MODEL, "skipped": True, "reason": "VRAM_LOW", "vram_free_mb": free_mb}) + "\n")
        sys.exit(0)
else:
    print("[warn] Could not read VRAM")
    free_mb = 9999  # assume ok

# Step 2: Load model
print(f"\n[load] Loading {MODEL}...")
t_load = time.monotonic()
load_model(MODEL, keep_alive=300)
print(f"[load] Done in {int((time.monotonic()-t_load)*1000)}ms")
time.sleep(2)

v2 = vram_read()
if v2:
    vram_idle = v2[0]
    temp_c = v2[2]
    print(f"[vram] Post-load (idle): {vram_idle} MB used, {v2[1]} MB free, {v2[2]}°C")
else:
    vram_idle = used_mb if v else 0
    temp_c = 0
    print("[warn] Could not read VRAM after load")

restore_horus()

# ─── T1: Monitor Matching ────────────────────────────────────────────────────
print(f"\n{'─'*40}")
print("T1: Monitor Matching (0-4 pts)")
print(f"{'─'*40}")

T1_SYS = ('Soglie: db_pool_used>=8=WARN >=9=ERROR; last_cycle_min_ago>=70=WARN >=120=ERROR; '
           'errors>0=ERROR; hnsw_ok=false=ERROR; heartbeat_age_sec>=300=ERROR. '
           'Rispondi SOLO con JSON valido: {"status":"ok|warn|error","reason":"stringa breve"}')

T1_CASES = [
    ('{"db_pool_used":5,"last_cycle_min_ago":45,"errors":0,"hnsw_ok":true,"heartbeat_age_sec":12}', "ok"),
    ('{"db_pool_used":9,"last_cycle_min_ago":80,"errors":0,"hnsw_ok":true,"heartbeat_age_sec":30}', "error"),
    ('{"db_pool_used":6,"last_cycle_min_ago":55,"errors":3,"hnsw_ok":false,"heartbeat_age_sec":480}', "error"),
    ('{"db_pool_used":8,"last_cycle_min_ago":71,"errors":0,"hnsw_ok":true,"heartbeat_age_sec":20}', "warn"),
]

t1_score = 0
t1_lats = []

for i, (prompt, expected) in enumerate(T1_CASES):
    msgs = [{"role": "system", "content": T1_SYS}, {"role": "user", "content": prompt}]
    resp, lat = call_model(MODEL, msgs)
    t1_lats.append(lat)
    d = extract_json(resp)
    got = d.get("status", "").lower().strip()
    s = 1 if got == expected else 0
    t1_score += s
    print(f"  S{i+1} (expect {expected:5s}): {'✓' if s else '✗'} lat={lat}ms got={got!r} resp={resp[:70]!r}")

# One VRAM read after the whole T1 group
v3 = vram_read()
vram_t1_peak = v3[0] if v3 else vram_idle

t1_lat_avg = sum(t1_lats) // len(t1_lats)
print(f"  → T1: {t1_score}/4  avg_lat={t1_lat_avg}ms  vram_peak={vram_t1_peak}MB")

# ─── T2: Escalation Horus ────────────────────────────────────────────────────
print(f"\n{'─'*40}")
print("T2: Escalation Horus (0-3 pts)")
print(f"{'─'*40}")

T2_SYS = ('Sei Bowie, assistant BikerLink. Hai rilevato un segnale critico nel sistema matching. '
           'Decidi se svegliare Horus e prepara il messaggio di escalation. '
           'Rispondi SOLO JSON: {"wake_horus":bool,"priority":"low|high|critical","message":"max 80 char"}')
T2_PROMPT = '{"signal":"heartbeat_dead","heartbeat_age_sec":510,"errors":4,"hnsw_ok":false,"db_pool":9}'

msgs = [{"role": "system", "content": T2_SYS}, {"role": "user", "content": T2_PROMPT}]
t2_resp, t2_lat = call_model(MODEL, msgs)
v4 = vram_read()
vram_t2_peak = v4[0] if v4 else vram_idle

d2 = extract_json(t2_resp)
t2_score = 0
details = []
if d2.get("wake_horus") is True:
    t2_score += 1; details.append("wake_horus=true ✓")
else:
    details.append(f"wake_horus={d2.get('wake_horus')!r} ✗")
if str(d2.get("priority","")).lower() == "critical":
    t2_score += 1; details.append("priority=critical ✓")
else:
    details.append(f"priority={d2.get('priority')!r} ✗")
msg_val = str(d2.get("message",""))
if msg_val and 0 < len(msg_val) <= 80:
    t2_score += 1; details.append(f"message({len(msg_val)}c) ✓")
else:
    details.append(f"message({len(msg_val)}c) ✗")

print(f"  → {' | '.join(details)}")
print(f"  resp: {t2_resp[:120]!r}")
print(f"  → T2: {t2_score}/3  lat={t2_lat}ms")

# ─── T3: Tool Calling ────────────────────────────────────────────────────────
print(f"\n{'─'*40}")
print("T3: Tool Calling (0-3 pts)")
print(f"{'─'*40}")

T3_SYS = ('Sei Bowie, assistant BikerLink. Hai accesso a questi tool:\n'
           '- search_manual(query): cerca nel manuale BikerLink via Nadir\n'
           '- get_weather(city, date): meteo per città e data\n'
           '- web_search(query): cerca informazioni sul web\n'
           'Rispondi SOLO JSON: {"tool":"nome","args":{...}}\n'
           'oppure {"tool":"none","reply":"..."} se non serve un tool.')

T3_CASES = [
    ("che tempo farà domani a napoli?", "get_weather"),
    ("come funziona il matching su bikerlink?", "search_manual"),
    ("qual è il limite di velocità in autostrada in italia?", "web_search"),
]

t3_score = 0
t3_lats = []

for i, (prompt, expected_tool) in enumerate(T3_CASES):
    msgs = [{"role": "system", "content": T3_SYS}, {"role": "user", "content": prompt}]
    resp, lat = call_model(MODEL, msgs)
    t3_lats.append(lat)
    d3 = extract_json(resp)
    got_tool = d3.get("tool","").lower().strip()
    s = 1 if got_tool == expected_tool else 0
    t3_score += s
    print(f"  Q{i+1} (expect {expected_tool}): {'✓' if s else '✗'} lat={lat}ms got={got_tool!r}")

# One VRAM read after the whole T3 group
v5 = vram_read()
vram_t3_peak = v5[0] if v5 else vram_idle

t3_lat_avg = sum(t3_lats) // len(t3_lats)
print(f"  → T3: {t3_score}/3  avg_lat={t3_lat_avg}ms  vram_peak={vram_t3_peak}MB")

# ─── T4: Dialetto Meridionale ────────────────────────────────────────────────
print(f"\n{'─'*40}")
print("T4: Dialetto Meridionale (0-4 pts)")
print(f"{'─'*40}")

T4_SYS = ("Sei Bowie, assistant di BikerLink. Rispondi sempre in italiano standard, gentile e utile. "
           "L'utente potrebbe scrivere con errori di battitura o termini dialettali meridionali.")

T4_MSGS = [
    ("oi nun riesc a truva compagni pe viaggià, cumm si fa?",
     ["compagni","viaggio","cerca","trova","profilo","matching","registra"]),
    ("appicciato l app ma nun part, che cazz succede",
     ["app","aggiorna","riavvia","problema","controlla","versione","tecnico"]),
    ("voglo saper se posso mettere la mia moto preferita sulapp, ho na ducati",
     ["ducati","moto","profilo","aggiungere","sì","puoi","inserire","modifica"]),
    ("sto cercando qualcunno pe fare un viaggio vrs palermo, sai aiutarm?",
     ["palermo","viaggio","compagni","cerca","trova","percorso","match"]),
]

t4_score = 0
t4_lats = []
history = []

for i, (prompt, kws) in enumerate(T4_MSGS):
    msgs = [{"role": "system", "content": T4_SYS}] + history + [{"role": "user", "content": prompt}]
    resp, lat = call_model(MODEL, msgs)
    t4_lats.append(lat)
    s = score_relevance(resp, kws)
    t4_score += s
    print(f"  M{i+1}: {'✓' if s else '✗'} lat={lat}ms resp={resp[:80]!r}")
    history.append({"role": "user", "content": prompt})
    history.append({"role": "assistant", "content": resp})

# One VRAM read after the whole T4 group
v6 = vram_read()
vram_t4_peak = v6[0] if v6 else vram_idle

t4_lat_avg = sum(t4_lats) // len(t4_lats)
print(f"  → T4: {t4_score}/4  avg_lat={t4_lat_avg}ms  vram_peak={vram_t4_peak}MB")

# ─── T5: Multi-Turn Coerenza ─────────────────────────────────────────────────
print(f"\n{'─'*40}")
print("T5: Multi-Turn Coerenza (0-3 pts)")
print(f"{'─'*40}")

T5_SYS = ("Sei Bowie, assistant di BikerLink. Rispondi in italiano. "
           "Sei esperto di BikerLink, app per motociclisti.")

t5_score = 0
t5_lats = []
history5 = []

# Turn 1: matching
p1 = "ciao, come funziona la ricerca di compagni di viaggio su BikerLink?"
msgs = [{"role":"system","content":T5_SYS}] + history5 + [{"role":"user","content":p1}]
r1, l1 = call_model(MODEL, msgs)
t5_lats.append(l1)
s1 = score_relevance(r1, ["matching","compagni","viaggio","ricerca","trova","profilo","preferenze"])
t5_score += s1
print(f"  T1 (matching): {'✓' if s1 else '✗'} lat={l1}ms resp={r1[:80]!r}")
history5.append({"role":"user","content":p1})
history5.append({"role":"assistant","content":r1})

# Turn 2: ducati km — should hedge
p2 = "ah ok grazie. invece, quanti km fa una ducati monster con un pieno?"
msgs = [{"role":"system","content":T5_SYS}] + history5 + [{"role":"user","content":p2}]
r2, l2 = call_model(MODEL, msgs)
t5_lats.append(l2)
rl = r2.lower()
hedge_words = ["dipende","circa","varia","non sono sicuro","non lo so","consulta",
               "sito","scheda tecnica","approssimativamente","generalmente","intorno","stima"]
has_hedge = any(w in rl for w in hedge_words)
confident_km = re.findall(r"\b(\d{2,3})\s*km\b", rl)
# Score 1 if hedges OR no specific km stated AND response is non-trivial
s2 = 1 if (len(rl.strip()) > 20 and (has_hedge or not confident_km)) else 0
print(f"  T2 (km hedge): {'✓' if s2 else '✗'} lat={l2}ms hedge={has_hedge} km_claims={confident_km} resp={r2[:80]!r}")
t5_score += s2
history5.append({"role":"user","content":p2})
history5.append({"role":"assistant","content":r2})

# Turn 3: back to matching
p3 = "torniamo al matching — posso filtrare per marca di moto?"
msgs = [{"role":"system","content":T5_SYS}] + history5 + [{"role":"user","content":p3}]
r3, l3 = call_model(MODEL, msgs)
t5_lats.append(l3)
s3 = score_relevance(r3, ["matching","marca","filtro","filtrare","moto","preferenze","ricerca","compagni"])
t5_score += s3
print(f"  T3 (match+marca): {'✓' if s3 else '✗'} lat={l3}ms resp={r3[:80]!r}")

# One VRAM read after the whole T5 group
v8 = vram_read()
vram_t5_peak = v8[0] if v8 else vram_idle

t5_lat_avg = sum(t5_lats) // len(t5_lats)
print(f"  → T5: {t5_score}/3  avg_lat={t5_lat_avg}ms  vram_peak={vram_t5_peak}MB")

# ─── Summary ──────────────────────────────────────────────────────────────────
total = t1_score + t2_score + t3_score + t4_score + t5_score
all_lats = t1_lats + [t2_lat] + t3_lats + t4_lats + t5_lats
lat_avg = sum(all_lats) // len(all_lats)

print(f"\n{'='*50}")
print(f"RESULT: {MODEL}")
print(f"  T1={t1_score}/4  T2={t2_score}/3  T3={t3_score}/3  T4={t4_score}/4  T5={t5_score}/3  TOTAL={total}/17")
print(f"  VRAM idle={vram_idle}  T1_peak={vram_t1_peak}  T2_peak={vram_t2_peak}  T3_peak={vram_t3_peak}  T4_peak={vram_t4_peak}  T5_peak={vram_t5_peak}")
print(f"  LAT avg={lat_avg}ms  temp={temp_c}°C")
print(f"{'='*50}")

# Write result
result = {
    "model": MODEL,
    "t1": t1_score, "t2": t2_score, "t3": t3_score, "t4": t4_score, "t5": t5_score,
    "total": total,
    "lat_avg_ms": lat_avg,
    "vram_idle_mb": vram_idle,
    "vram_t1_peak_mb": vram_t1_peak,
    "vram_t2_peak_mb": vram_t2_peak,
    "vram_t3_peak_mb": vram_t3_peak,
    "vram_t4_peak_mb": vram_t4_peak,
    "vram_t5_peak_mb": vram_t5_peak,
    "temp_c": temp_c,
    "t1_lats": t1_lats,
    "t2_lat": t2_lat,
    "t3_lats": t3_lats,
    "t4_lats": t4_lats,
    "t5_lats": t5_lats,
}
with open(RESULTS_FILE, "a") as f:
    f.write(json.dumps(result) + "\n")
print(f"[done] Result written to {RESULTS_FILE}")

# ─── Cleanup ──────────────────────────────────────────────────────────────────
print(f"\n[cleanup] Unloading {MODEL}...")
unload_model(MODEL)
time.sleep(3)
restore_horus()

if not SKIP_RM and MODEL not in PROTECTED:
    print(f"[cleanup] Removing {MODEL} from disk...")
    rm_model(MODEL)
else:
    print(f"[cleanup] Keeping {MODEL} (skip_rm or protected)")

vf = vram_read()
if vf:
    print(f"[final] VRAM: used={vf[0]} free={vf[1]} temp={vf[2]}°C")
print(f"\nDONE: {MODEL} → {total}/17")
