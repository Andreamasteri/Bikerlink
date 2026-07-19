#!/usr/bin/env python3
"""
tc-benchmark-cont.py — Continua il benchmark con i modelli 4-7.
Eseguito DIRETTAMENTE sul ThinkCentre (localhost:11434).
Appende a /tmp/bowie-benchmark-results.jsonl
"""
import json, re, subprocess, time, tempfile, os, sys

OLLAMA_URL = "http://localhost:11434"
RESULTS_FILE = "/tmp/bowie-benchmark-results.jsonl"
HORUS_MODEL = "qwen3:4b"
PROTECTED = {"qwen3:1.7b","qwen3:4b","qwen3:14b","bikerlink:latest","bikerlink-routing:latest"}

MODELS = [
    ("hf.co/unsloth/Qwen3.5-2B-GGUF:Qwen3.5-2B-Q3_K_M", False),
    ("hf.co/unsloth/Qwen3.5-2B-GGUF:Qwen3.5-2B-Q4_K_M", False),
    ("hf.co/ibm-granite/granite-3.3-2b-instruct-GGUF:granite-3.3-2b-instruct-Q2_K", False),
    ("hf.co/ibm-granite/granite-3.3-2b-instruct-GGUF:granite-3.3-2b-instruct-Q3_K_M", False),
]

def log(msg):
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

def vram():
    try:
        r = subprocess.run(
            ["nvidia-smi","--query-gpu=memory.used,memory.free,temperature.gpu",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10)
        parts = [p.strip() for p in r.stdout.strip().split(",")]
        return int(parts[0]), int(parts[1]), int(parts[2])
    except Exception as e:
        log(f"vram error: {e}")
        return 0, 9999, 0

def ps_loaded():
    try:
        r = subprocess.run(["curl","-s","--max-time","5",f"{OLLAMA_URL}/api/ps"],
                           capture_output=True, text=True, timeout=10)
        d = json.loads(r.stdout)
        return [m["name"] for m in d.get("models",[])]
    except:
        return []

def pin(model, keep_alive=-1):
    payload = json.dumps({"model":model,"prompt":"ok","stream":True,
                          "keep_alive":keep_alive,"options":{"num_predict":1}})
    try:
        subprocess.run(["curl","-s","--no-buffer","--max-time","120",
                        f"{OLLAMA_URL}/api/generate","-d",payload],
                       capture_output=True, timeout=125)
    except:
        pass

def unload(model):
    payload = json.dumps({"model":model,"prompt":"x","stream":True,
                          "keep_alive":0,"options":{"num_predict":1}})
    try:
        subprocess.run(["curl","-s","--no-buffer","--max-time","30",
                        f"{OLLAMA_URL}/api/generate","-d",payload],
                       capture_output=True, timeout=35)
    except:
        pass

def rm_model(model):
    if model in PROTECTED:
        return
    payload = json.dumps({"model":model})
    try:
        subprocess.run(["curl","-s","--max-time","15","-X","DELETE",
                        f"{OLLAMA_URL}/api/delete",
                        "-H","Content-Type: application/json","-d",payload],
                       capture_output=True, timeout=20)
    except:
        pass

def parse_stream(data):
    chunks = []
    for line in data.splitlines():
        line = line.strip()
        if not line: continue
        try:
            d = json.loads(line)
            chunk = d.get("message",{}).get("content","") or d.get("response","") or ""
            if chunk: chunks.append(chunk)
        except: pass
    text = "".join(chunks)
    text = re.sub(r"<think>[\s\S]*?</think>","",text)
    text = re.sub(r"^[\s\S]*?</think>\s*","",text)
    return text.strip()

def call(model, messages, num_predict=400, timeout=45):
    payload = json.dumps({
        "model":model,"messages":messages,
        "stream":True,"think":False,"options":{"num_predict":num_predict}
    })
    with tempfile.NamedTemporaryFile(delete=False,suffix=".ndjson") as f:
        tmp = f.name
    t0 = time.monotonic()
    try:
        subprocess.run(
            ["curl","-s","--no-buffer","--max-time",str(timeout),
             f"{OLLAMA_URL}/api/chat",
             "-H","Content-Type: application/json","-d",payload,"-o",tmp],
            capture_output=True, timeout=timeout+5)
        lat = int((time.monotonic()-t0)*1000)
        with open(tmp,"r",errors="replace") as f:
            text = parse_stream(f.read())
        os.unlink(tmp)
        return text, lat
    except Exception as e:
        try: os.unlink(tmp)
        except: pass
        return f"ERROR:{e}", 0

def extract_json(text):
    try: return json.loads(text.strip())
    except: pass
    start = text.find("{")
    if start == -1: return {}
    depth = 0
    for i,ch in enumerate(text[start:],start):
        if ch=="{": depth+=1
        elif ch=="}":
            depth-=1
            if depth==0:
                try: return json.loads(text[start:i+1])
                except: break
    return {}

def score_rel(text, keywords):
    if not text or len(text.strip())<10: return 0
    tl = text.lower()
    if any(w in tl for w in ["non posso","impossibile rispondere","non sono in grado"]): return 0
    eng = sum(1 for w in ["hello","sorry","cannot","please","this is","your "] if w in tl)
    it  = sum(1 for w in ["ciao","grazie","puoi","hai","moto","app","bikerlink","viaggio",
                           "cerca","trova","ducati","palermo","compagni","profil",
                           "posso","come","non ","per ","che ","del ","della "] if w in tl)
    if eng > it and eng > 3: return 0
    kw_hit = any(k.lower() in tl for k in keywords if k)
    return 1 if (kw_hit or it>3) else 0

def check_horus():
    return HORUS_MODEL in ps_loaded()

def restore_horus():
    if not check_horus():
        log("  [WARN] Horus missing! Restoring...")
        pin(HORUS_MODEL, keep_alive=-1)
        time.sleep(3)
        log(f"  [restore] {'ok' if check_horus() else 'STILL MISSING'}")
    else:
        log("  [ok] Horus in VRAM.")

def benchmark_model(model, skip_rm):
    log(f"\n{'='*52}")
    log(f"BENCHMARKING: {model}")
    log(f"{'='*52}")
    pin(HORUS_MODEL, keep_alive=-1)

    used,free,temp_c = vram()
    log(f"[vram] Pre-load: used={used} free={free} temp={temp_c}°C")
    if free < 2000:
        log(f"[SKIP] VRAM free {free} MB < 2000 MB")
        return {"model":model,"skipped":True,"reason":"VRAM_LOW","vram_free_mb":free,"total":0}

    log(f"[load] Loading {model}...")
    t0 = time.monotonic()
    pin(model, keep_alive=600)
    load_ms = int((time.monotonic()-t0)*1000)
    log(f"[load] Done in {load_ms}ms")
    time.sleep(2)

    used2,free2,temp_c = vram()
    vram_idle = used2
    log(f"[vram] Post-load: used={vram_idle} free={free2} temp={temp_c}°C")

    # Verify model actually loaded (not a timeout)
    loaded = ps_loaded()
    log(f"[ps] Loaded: {loaded}")
    model_in_vram = any(model in m or m in model for m in loaded)
    if not model_in_vram:
        log(f"[FAIL] Model not in VRAM after load — marking as load_failed")
        restore_horus()
        return {"model":model,"skipped":True,"reason":"LOAD_FAILED","load_ms":load_ms,"total":0}
    restore_horus()

    # T1 Monitor Matching
    log(f"\n--- T1: Monitor Matching (0-4) ---")
    T1_SYS = ('Soglie: db_pool_used>=8=WARN >=9=ERROR; last_cycle_min_ago>=70=WARN >=120=ERROR; '
               'errors>0=ERROR; hnsw_ok=false=ERROR; heartbeat_age_sec>=300=ERROR. '
               'Rispondi SOLO con JSON valido: {"status":"ok|warn|error","reason":"stringa breve"}')
    T1_CASES = [
        ('{"db_pool_used":5,"last_cycle_min_ago":45,"errors":0,"hnsw_ok":true,"heartbeat_age_sec":12}', "ok"),
        ('{"db_pool_used":9,"last_cycle_min_ago":80,"errors":0,"hnsw_ok":true,"heartbeat_age_sec":30}', "error"),
        ('{"db_pool_used":6,"last_cycle_min_ago":55,"errors":3,"hnsw_ok":false,"heartbeat_age_sec":480}', "error"),
        ('{"db_pool_used":8,"last_cycle_min_ago":71,"errors":0,"hnsw_ok":true,"heartbeat_age_sec":20}', "warn"),
    ]
    t1_score=0; t1_lats=[]
    for i,(prompt,expected) in enumerate(T1_CASES):
        msgs=[{"role":"system","content":T1_SYS},{"role":"user","content":prompt}]
        resp,lat=call(model,msgs)
        t1_lats.append(lat)
        d=extract_json(resp)
        got=d.get("status","").lower().strip()
        s=1 if got==expected else 0; t1_score+=s
        log(f"  S{i+1} ({expected:5s}): {'✓' if s else '✗'} lat={lat}ms got={got!r} resp={resp[:60]!r}")
    v3=vram(); vram_t1=v3[0]; t1_avg=sum(t1_lats)//len(t1_lats)
    log(f"  → T1: {t1_score}/4 avg={t1_avg}ms peak={vram_t1}MB")

    # T2 Escalation
    log(f"\n--- T2: Escalation Horus (0-3) ---")
    T2_SYS=('Sei Bowie, assistant BikerLink. Hai rilevato un segnale critico nel sistema matching. '
             'Decidi se svegliare Horus e prepara il messaggio di escalation. '
             'Rispondi SOLO JSON: {"wake_horus":bool,"priority":"low|high|critical","message":"max 80 char"}')
    msgs=[{"role":"system","content":T2_SYS},
          {"role":"user","content":'{"signal":"heartbeat_dead","heartbeat_age_sec":510,"errors":4,"hnsw_ok":false,"db_pool":9}'}]
    t2_resp,t2_lat=call(model,msgs)
    v4=vram(); vram_t2=v4[0]
    d2=extract_json(t2_resp); t2_score=0; det=[]
    if d2.get("wake_horus") is True: t2_score+=1; det.append("wake_horus ✓")
    else: det.append(f"wake_horus={d2.get('wake_horus')!r} ✗")
    if str(d2.get("priority","")).lower()=="critical": t2_score+=1; det.append("priority ✓")
    else: det.append(f"priority={d2.get('priority')!r} ✗")
    msg_val=str(d2.get("message",""))
    if msg_val and 0<len(msg_val)<=80: t2_score+=1; det.append(f"msg({len(msg_val)}c) ✓")
    else: det.append(f"msg({len(msg_val)}c) ✗")
    log(f"  {' | '.join(det)}")
    log(f"  resp: {t2_resp[:100]!r}")
    log(f"  → T2: {t2_score}/3 lat={t2_lat}ms peak={vram_t2}MB")

    # T3 Tool Calling
    log(f"\n--- T3: Tool Calling (0-3) ---")
    T3_SYS=('Sei Bowie, assistant BikerLink. Hai accesso a questi tool:\n'
             '- search_manual(query): cerca nel manuale BikerLink via Nadir\n'
             '- get_weather(city, date): meteo per città e data\n'
             '- web_search(query): cerca informazioni sul web\n'
             'Rispondi SOLO JSON: {"tool":"nome","args":{...}}\n'
             'oppure {"tool":"none","reply":"..."} se non serve un tool.')
    T3_CASES=[("che tempo farà domani a napoli?","get_weather"),
               ("come funziona il matching su bikerlink?","search_manual"),
               ("qual è il limite di velocità in autostrada in italia?","web_search")]
    t3_score=0; t3_lats=[]
    for i,(prompt,expected_tool) in enumerate(T3_CASES):
        msgs=[{"role":"system","content":T3_SYS},{"role":"user","content":prompt}]
        resp,lat=call(model,msgs); t3_lats.append(lat)
        d3=extract_json(resp); got_tool=d3.get("tool","").lower().strip()
        s=1 if got_tool==expected_tool else 0; t3_score+=s
        log(f"  Q{i+1} ({expected_tool}): {'✓' if s else '✗'} lat={lat}ms got={got_tool!r}")
    v5=vram(); vram_t3=v5[0]; t3_avg=sum(t3_lats)//len(t3_lats)
    log(f"  → T3: {t3_score}/3 avg={t3_avg}ms peak={vram_t3}MB")

    # T4 Dialetto
    log(f"\n--- T4: Dialetto Meridionale (0-4) ---")
    T4_SYS=("Sei Bowie, assistant di BikerLink. Rispondi sempre in italiano standard, gentile e utile. "
             "L'utente potrebbe scrivere con errori di battitura o termini dialettali meridionali.")
    T4_MSGS=[
        ("oi nun riesc a truva compagni pe viaggià, cumm si fa?",
         ["compagni","viaggio","cerca","trova","profilo","matching","registra"]),
        ("appicciato l app ma nun part, che cazz succede",
         ["app","aggiorna","riavvia","problema","controlla","versione","tecnico"]),
        ("voglo saper se posso mettere la mia moto preferita sulapp, ho na ducati",
         ["ducati","moto","profilo","aggiungere","sì","puoi","inserire","modifica"]),
        ("sto cercando qualcunno pe fare un viaggio vrs palermo, sai aiutarm?",
         ["palermo","viaggio","compagni","cerca","trova","percorso","match"]),
    ]
    t4_score=0; t4_lats=[]; history=[]
    for i,(prompt,kws) in enumerate(T4_MSGS):
        msgs=[{"role":"system","content":T4_SYS}]+history+[{"role":"user","content":prompt}]
        resp,lat=call(model,msgs,timeout=60); t4_lats.append(lat)
        s=score_rel(resp,kws); t4_score+=s
        log(f"  M{i+1}: {'✓' if s else '✗'} lat={lat}ms resp={resp[:70]!r}")
        history.append({"role":"user","content":prompt})
        history.append({"role":"assistant","content":resp})
    v6=vram(); vram_t4=v6[0]; t4_avg=sum(t4_lats)//len(t4_lats)
    log(f"  → T4: {t4_score}/4 avg={t4_avg}ms peak={vram_t4}MB")

    # T5 Multi-Turn
    log(f"\n--- T5: Multi-Turn Coerenza (0-3) ---")
    T5_SYS=("Sei Bowie, assistant di BikerLink. Rispondi in italiano. "
             "Sei esperto di BikerLink, app per motociclisti.")
    t5_score=0; t5_lats=[]; h5=[]
    p1="ciao, come funziona la ricerca di compagni di viaggio su BikerLink?"
    msgs=[{"role":"system","content":T5_SYS}]+h5+[{"role":"user","content":p1}]
    r1,l1=call(model,msgs,timeout=60); t5_lats.append(l1)
    s1=score_rel(r1,["matching","compagni","viaggio","ricerca","trova","profilo","preferenze"])
    t5_score+=s1; log(f"  T1 (matching): {'✓' if s1 else '✗'} lat={l1}ms resp={r1[:70]!r}")
    h5.append({"role":"user","content":p1}); h5.append({"role":"assistant","content":r1})

    p2="ah ok grazie. invece, quanti km fa una ducati monster con un pieno?"
    msgs=[{"role":"system","content":T5_SYS}]+h5+[{"role":"user","content":p2}]
    r2,l2=call(model,msgs,timeout=60); t5_lats.append(l2)
    rl=r2.lower()
    hedges=["dipende","circa","varia","non sono sicuro","non lo so","consulta",
            "sito","scheda tecnica","approssimativamente","generalmente","intorno","stima"]
    has_hedge=any(w in rl for w in hedges)
    conf_km=re.findall(r"\b(\d{2,3})\s*km\b",rl)
    s2=1 if (len(rl.strip())>20 and (has_hedge or not conf_km)) else 0
    log(f"  T2 (km hedge): {'✓' if s2 else '✗'} lat={l2}ms hedge={has_hedge} km={conf_km[:3]} resp={r2[:70]!r}")
    t5_score+=s2
    h5.append({"role":"user","content":p2}); h5.append({"role":"assistant","content":r2})

    p3="torniamo al matching — posso filtrare per marca di moto?"
    msgs=[{"role":"system","content":T5_SYS}]+h5+[{"role":"user","content":p3}]
    r3,l3=call(model,msgs,timeout=60); t5_lats.append(l3)
    s3=score_rel(r3,["matching","marca","filtro","filtrare","moto","preferenze","ricerca","compagni"])
    t5_score+=s3; log(f"  T3 (match+marca): {'✓' if s3 else '✗'} lat={l3}ms resp={r3[:70]!r}")
    v8=vram(); vram_t5=v8[0]; t5_avg=sum(t5_lats)//len(t5_lats)
    log(f"  → T5: {t5_score}/3 avg={t5_avg}ms peak={vram_t5}MB")

    total=t1_score+t2_score+t3_score+t4_score+t5_score
    all_lats=t1_lats+[t2_lat]+t3_lats+t4_lats+t5_lats
    lat_avg=sum(all_lats)//len(all_lats)

    log(f"\n{'='*52}")
    log(f"RESULT: {model}")
    log(f"  T1={t1_score}/4 T2={t2_score}/3 T3={t3_score}/3 T4={t4_score}/4 T5={t5_score}/3 TOTAL={total}/17")
    log(f"  VRAM: idle={vram_idle} T1={vram_t1} T2={vram_t2} T3={vram_t3} T4={vram_t4} T5={vram_t5}")
    log(f"  LAT: avg={lat_avg}ms temp={temp_c}°C")
    log(f"{'='*52}")

    result={
        "model":model,"t1":t1_score,"t2":t2_score,"t3":t3_score,"t4":t4_score,"t5":t5_score,
        "total":total,"lat_avg_ms":lat_avg,"vram_idle_mb":vram_idle,
        "vram_t1_mb":vram_t1,"vram_t2_mb":vram_t2,"vram_t3_mb":vram_t3,
        "vram_t4_mb":vram_t4,"vram_t5_mb":vram_t5,"temp_c":temp_c,
        "t1_lats":t1_lats,"t2_lat":t2_lat,"t3_lats":t3_lats,
        "t4_lats":t4_lats,"t5_lats":t5_lats,
    }
    with open(RESULTS_FILE,"a") as f:
        f.write(json.dumps(result)+"\n")

    log(f"\n[cleanup] Unloading {model}...")
    unload(model); time.sleep(3); restore_horus()
    if not skip_rm and model not in PROTECTED:
        log(f"[cleanup] Removing {model}...")
        rm_model(model)
    vf=vram(); log(f"[final] VRAM: used={vf[0]} free={vf[1]} temp={vf[2]}°C")
    return result

if __name__ == "__main__":
    log(f"=== Bowie Benchmark CONT (models 4-7) ===")
    # Record 0.8B as load_failed
    with open(RESULTS_FILE,"a") as f:
        f.write(json.dumps({"model":"hf.co/ggml-org/Qwen3.5-0.8B-GGUF:Qwen3.5-0.8B-Q8_0.gguf",
                            "skipped":True,"reason":"LOAD_FAILED_TIMEOUT","total":0})+"\n")
    log("Recorded 0.8B as LOAD_FAILED_TIMEOUT")
    for model,skip_rm in MODELS:
        try:
            benchmark_model(model, skip_rm)
        except Exception as e:
            log(f"ERROR {model}: {e}")
            with open(RESULTS_FILE,"a") as f:
                f.write(json.dumps({"model":model,"error":str(e),"total":0})+"\n")
        time.sleep(5)
    log("\n=== CONT DONE ===")
