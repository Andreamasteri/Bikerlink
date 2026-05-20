#!/usr/bin/env python3
"""Genera docs/ota-schema-a4.pdf — Schema OTA BikerLink (A4 stampabile)"""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from datetime import date
import os
import re
import json

# ── Lettura dinamica dei valori di release ─────────────────────────────────────
def _read_current_ota_number():
    """Legge CURRENT_OTA_NUMBER da lib/ota.ts."""
    try:
        with open("lib/ota.ts", encoding="utf-8") as f:
            content = f.read()
        m = re.search(r"CURRENT_OTA_NUMBER\s*=\s*(\d+)", content)
        if m:
            return int(m.group(1))
    except Exception:
        pass
    return None

def _read_runtime_version():
    """Legge expo.runtimeVersion da app.json."""
    try:
        with open("app.json", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("expo", {}).get("runtimeVersion") or None
    except Exception:
        pass
    return None

CURRENT_OTA_NUMBER = _read_current_ota_number()
RUNTIME_VERSION    = _read_runtime_version()

OTA_LABEL = f"#{CURRENT_OTA_NUMBER}" if CURRENT_OTA_NUMBER is not None else "N/A"
RV_LABEL  = RUNTIME_VERSION if RUNTIME_VERSION else "N/A"

# ── Colori BikerLink ──────────────────────────────────────────────────────────
BL_ORANGE   = colors.HexColor("#E8541A")
BL_DARK     = colors.HexColor("#1A1A2E")
BL_GREY     = colors.HexColor("#4A4A6A")
BL_LIGHT    = colors.HexColor("#F5F5F7")
BL_BORDER   = colors.HexColor("#D0D0E0")
BL_GREEN    = colors.HexColor("#2E7D52")
BL_BLUE     = colors.HexColor("#1A5FA8")
BL_RED      = colors.HexColor("#C62828")
BL_AMBER    = colors.HexColor("#E65100")
WHITE       = colors.white
BLACK       = colors.black

# ── Stili testo ───────────────────────────────────────────────────────────────
def make_styles():
    base = dict(fontName="Helvetica", leading=11)
    return {
        "title": ParagraphStyle("title",
            fontName="Helvetica-Bold", fontSize=16, textColor=WHITE,
            leading=20, alignment=TA_CENTER),
        "subtitle": ParagraphStyle("subtitle",
            fontName="Helvetica", fontSize=9, textColor=colors.HexColor("#CCCCEE"),
            leading=13, alignment=TA_CENTER),
        "section": ParagraphStyle("section",
            fontName="Helvetica-Bold", fontSize=9, textColor=WHITE,
            leading=12, alignment=TA_LEFT),
        "cell_bold": ParagraphStyle("cell_bold",
            fontName="Helvetica-Bold", fontSize=7.5, textColor=BL_DARK, leading=10),
        "cell": ParagraphStyle("cell",
            fontName="Helvetica", fontSize=7.5, textColor=BL_DARK, leading=10),
        "cell_small": ParagraphStyle("cell_small",
            fontName="Helvetica", fontSize=7, textColor=BL_GREY, leading=9),
        "cell_code": ParagraphStyle("cell_code",
            fontName="Courier", fontSize=7, textColor=BL_BLUE, leading=9),
        "footer": ParagraphStyle("footer",
            fontName="Helvetica", fontSize=7, textColor=BL_GREY,
            leading=10, alignment=TA_CENTER),
        "col_header": ParagraphStyle("col_header",
            fontName="Helvetica-Bold", fontSize=7.5, textColor=WHITE,
            leading=10, alignment=TA_CENTER),
    }

S = make_styles()

def p(text, style="cell"):
    return Paragraph(text, S[style])

def section_header(title, icon=""):
    full = f"{icon}  {title}" if icon else title
    return Table(
        [[Paragraph(full, S["section"])]],
        colWidths=[180*mm],
        style=TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), BL_DARK),
            ("LEFTPADDING",  (0,0), (-1,-1), 6),
            ("RIGHTPADDING", (0,0), (-1,-1), 6),
            ("TOPPADDING",   (0,0), (-1,-1), 5),
            ("BOTTOMPADDING",(0,0), (-1,-1), 5),
            ("ROUNDEDCORNERS", [3]),
        ])
    )

def col_header(*texts):
    return [p(t, "col_header") for t in texts]

def table_style_base(header_color=BL_DARK):
    return TableStyle([
        ("BACKGROUND",    (0,0),  (-1,0),  header_color),
        ("BACKGROUND",    (0,1),  (-1,-1), BL_LIGHT),
        ("ROWBACKGROUNDS",(0,1),  (-1,-1), [WHITE, BL_LIGHT]),
        ("GRID",          (0,0),  (-1,-1), 0.4, BL_BORDER),
        ("LINEBELOW",     (0,0),  (-1,0),  1,   BL_ORANGE),
        ("LEFTPADDING",   (0,0),  (-1,-1), 5),
        ("RIGHTPADDING",  (0,0),  (-1,-1), 5),
        ("TOPPADDING",    (0,0),  (-1,-1), 4),
        ("BOTTOMPADDING", (0,0),  (-1,-1), 4),
        ("VALIGN",        (0,0),  (-1,-1), "TOP"),
    ])

# ── Documento ─────────────────────────────────────────────────────────────────
os.makedirs("docs", exist_ok=True)
OUT = "docs/ota-schema-a4.pdf"

doc = SimpleDocTemplate(
    OUT,
    pagesize=A4,
    leftMargin=15*mm, rightMargin=15*mm,
    topMargin=15*mm, bottomMargin=15*mm,
    title="BikerLink OTA System — Schema",
    author="BikerLink",
)

W = A4[0] - 30*mm   # larghezza utile

story = []

# ══════════════════════════════════════════════════════════════════════════════
# HEADER
# ══════════════════════════════════════════════════════════════════════════════
header_table = Table(
    [[
        p("&#128663;  BikerLink OTA System", "title"),
        p(f"Schema di aggiornamento Over-The-Air\nGenerato il {date.today().strftime('%d %B %Y')}  —  biker-link.replit.app", "subtitle"),
    ]],
    colWidths=[W*0.55, W*0.45],
    style=TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), BL_DARK),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("RIGHTPADDING",  (0,0), (-1,-1), 10),
        ("TOPPADDING",    (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ])
)
story.append(header_table)
story.append(HRFlowable(width=W, thickness=2, color=BL_ORANGE, spaceAfter=6))

# ══════════════════════════════════════════════════════════════════════════════
# 1. FLUSSO DI PUBBLICAZIONE
# ══════════════════════════════════════════════════════════════════════════════
story.append(section_header("1.  Flusso di Pubblicazione OTA", "&#128640;"))
story.append(Spacer(1, 3))

pub_data = [
    col_header("#", "Fase", "Comando / Azione", "Cosa succede", "File coinvolto"),
    ["1", p("Pre-flight\nValidazione","cell_bold"),
     p("bash scripts/validate-ota.sh","cell_code"),
     p("Controlla CURRENT_OTA_NUMBER, entry ota-updates.json, URL backend, nessun PENDING, hash git valido, live-server guard HTTP 200","cell"),
     p("lib/ota.ts\nota-updates.json\napp.json","cell_small")],
    ["2", p("Export bundle\n(Stage 1)","cell_bold"),
     p("bash scripts/publish-ota.sh\nexport \"messaggio\"","cell_code"),
     p("Bump CURRENT_OTA_NUMBER, aggiunge entry pending in ota-updates.json, esegue npx expo export --platform android, verifica marker nel .hbc","cell"),
     p("lib/ota.ts\nota-updates.json\ndist-ota/","cell_small")],
    ["3", p("Verifica bundle","cell_bold"),
     p("(automatico nello Stage 1)","cell_code"),
     p("Cerca CURRENT_OTA_NUMBER=N nel binario .hbc con grep -oa. Blocca se non trovato o se il numero non corrisponde","cell"),
     p("dist-ota/_expo/static/\njs/android/*.hbc","cell_small")],
    ["4", p("Upload & Crea\nrelease (Stage 2)","cell_bold"),
     p("bash scripts/publish-ota.sh\npublish","cell_code"),
     p("Login admin, upload bundle su Object Storage (private/ota/), POST /api/admin/ota/create con bundleUrl + metadata","cell"),
     p("server/routes.ts\n/api/admin/ota/create","cell_small")],
    ["5", p("Promozione\nslot stable","cell_bold"),
     p("(automatico nello Stage 2)","cell_code"),
     p("POST /api/admin/ota/:id/assign-slot con slot=stable. Aggiorna ota-updates.json (status→published). Tutti i client ricevono l'OTA al prossimo check","cell"),
     p("/api/admin/ota/\n:id/assign-slot","cell_small")],
    ["6", p("Rollback\n(se necessario)","cell_bold"),
     p("bash scripts/rollback-ota.sh\n<updateNumber>","cell_code"),
     p("Login admin, POST /api/admin/ota/:releaseId/publish sull'entry storica, aggiorna lib/ota.ts e ota-updates.json (target→published, corrente→rolled-back)","cell"),
     p("scripts/rollback-ota.sh\nota-updates.json\nlib/ota.ts","cell_small")],
]

pub_col = [8*mm, 22*mm, 42*mm, 72*mm, 36*mm]
pub_table = Table(pub_data, colWidths=pub_col, style=table_style_base())
pub_table.setStyle(TableStyle([
    ("BACKGROUND", (0,1), (0,-1), colors.HexColor("#F0F0FA")),
    ("ALIGN",      (0,0), (0,-1), "CENTER"),
    ("FONTNAME",   (0,1), (0,-1), "Helvetica-Bold"),
    ("FONTSIZE",   (0,0), (-1,0),  7.5),
    ("FONTSIZE",   (0,1), (0,-1),  8),
    # colora le fasi
    ("BACKGROUND", (1,6), (1,6),  colors.HexColor("#FDECEA")),
]))
story.append(KeepTogether([pub_table]))
story.append(Spacer(1, 6))

# ══════════════════════════════════════════════════════════════════════════════
# 2 + 3. TRIGGER + LOGICA CLIENT (affiancate)
# ══════════════════════════════════════════════════════════════════════════════
story.append(section_header("2.  Trigger controllo aggiornamenti (client)        3.  Logica client", "&#128242;"))
story.append(Spacer(1, 3))

# Tabella 2 — trigger
t2_data = [
    [p("Trigger","col_header"), p("Sorgente","col_header"), p("Cooldown","col_header"), p("Force?","col_header")],
    [p("Avvio app","cell_bold"),     p("startup","cell_code"),   p("60 s (norm)\n5 min (3+ fail)","cell"), p("No","cell")],
    [p("Ritorno in fg","cell_bold"), p("appstate","cell_code"),  p("60 s","cell"), p("No","cell")],
    [p("OTA Gate\n(login/reg)","cell_bold"), p("login\nregister","cell_code"), p("60 s","cell"), p("No","cell")],
    [p("Manuale\n(admin panel)","cell_bold"), p("manual","cell_code"), p("Nessuno","cell"), p("Si","cell_bold")],
]
t2_col = [28*mm, 22*mm, 24*mm, 14*mm]
t2_style = table_style_base(BL_BLUE)
t2_table = Table(t2_data, colWidths=t2_col, style=t2_style)

# Tabella 3 — logica client
t3_data = [
    [p("Componente","col_header"), p("Funzione","col_header"), p("File","col_header")],
    [p("Probe HTTP","cell_bold"),
     p("Fetch parallelo a /api/expo-updates con timeout 8s per diagnostica rete vs SDK","cell"),
     p("ota-check.ts","cell_code")],
    [p("Deferred Reload","cell_bold"),
     p("Se app in primo piano al momento del fetch, il riavvio viene differito al prossimo backgrounding (AppState→background)","cell"),
     p("ota-check.ts","cell_code")],
    [p("Device ID\n(Extra-Params)","cell_bold"),
     p("Updates.setExtraParamAsync(\"device-id\", id) — persiste nello storage nativo, incluso in ogni chiamata OTA","cell"),
     p("ota-hardening.ts","cell_code")],
    [p("Heartbeat\nPost-Load","cell_bold"),
     p("POST /api/ota/heartbeat entro 1500ms dal boot se updateId presente. Resetta i contatori stuck in caso di successo","cell"),
     p("ota-hardening.ts","cell_code")],
    [p("Circuit Breaker\n(Stuck Gate)","cell_bold"),
     p("isOtaStuck() = true se rollbackCount >= 3 o stuckSessions >= 3. Blocca i check OTA e mostra Recovery UI","cell"),
     p("ota-stuck.ts","cell_code")],
    [p("Recovery UI","cell_bold"),
     p("Mostra banner all'utente con opzione clearOtaStuckState() per resettare i contatori e riprendere gli aggiornamenti","cell"),
     p("ota-stuck.ts","cell_code")],
]
t3_col = [26*mm, 52*mm, 22*mm]
t3_style = table_style_base(BL_DARK)
t3_table = Table(t3_data, colWidths=t3_col, style=t3_style)

# Affianca le due tabelle
side_table = Table(
    [[t2_table, Spacer(4,1), t3_table]],
    colWidths=[88*mm, 4*mm, 100*mm-2],
    style=TableStyle([
        ("VALIGN",  (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",  (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 0),
        ("TOPPADDING",   (0,0), (-1,-1), 0),
        ("BOTTOMPADDING",(0,0), (-1,-1), 0),
    ])
)
story.append(KeepTogether([side_table]))
story.append(Spacer(1, 6))

# ══════════════════════════════════════════════════════════════════════════════
# 4. BACKEND — ENDPOINT REST
# ══════════════════════════════════════════════════════════════════════════════
story.append(section_header("4.  Backend — Endpoint REST", "&#127760;"))
story.append(Spacer(1, 3))

ep_data = [
    col_header("Metodo", "Path", "Auth", "Funzione"),
    [p("GET","cell_bold"),  p("/api/expo-updates","cell_code"), p("—","cell"),
     p("Serve il manifest OTA (Expo Protocol v1, multipart/mixed). Slot-routing per device-id via expo-extra-params","cell")],
    [p("POST","cell_bold"), p("/api/admin/ota/create","cell_code"), p("Admin","cell"),
     p("Crea una nuova release OTA con bundleUrl, metadata e status=pending","cell")],
    [p("POST","cell_bold"), p("/api/admin/ota/:id/assign-slot","cell_code"), p("Admin","cell"),
     p("Promuove la release allo slot=stable. I client iniziano a riceverla al prossimo check","cell")],
    [p("POST","cell_bold"), p("/api/admin/ota/:id/publish","cell_code"), p("Admin","cell"),
     p("Usato dal rollback: riattiva una release storica (status→active)","cell")],
    [p("POST","cell_bold"), p("/api/ota/heartbeat","cell_code"), p("—","cell"),
     p("Riceve heartbeat post-load dal client (deviceId, releaseId, otaNumber). Conferma che il bundle è attivo","cell")],
    [p("POST","cell_bold"), p("/api/admin/ota-error","cell_code"), p("—","cell"),
     p("Telemetria errori OTA (phase, source, errorCode, nativeStack, probe, networkInfo). Fire-and-forget dal client","cell")],
]

ep_col = [14*mm, 62*mm, 14*mm, 90*mm]
ep_table = Table(ep_data, colWidths=ep_col, style=table_style_base(BL_BLUE))
story.append(KeepTogether([ep_table]))
story.append(Spacer(1, 6))

# ══════════════════════════════════════════════════════════════════════════════
# 5. SOURCE OF TRUTH
# ══════════════════════════════════════════════════════════════════════════════
story.append(section_header("5.  Source of Truth — File chiave", "&#128196;"))
story.append(Spacer(1, 3))

sot_data = [
    col_header("File", "Ruolo", "Aggiornato da"),
    [p("lib/ota.ts","cell_code"),
     p("Contiene CURRENT_OTA_NUMBER (costante TS inclusa nel bundle). Deve corrispondere all'ultima entry in ota-updates.json","cell"),
     p("publish-ota.sh (Stage 1)\nrollback-ota.sh","cell_small")],
    [p("ota-updates.json","cell_code"),
     p("Registro storico di tutte le OTA: updateNumber, version, runtimeVersion, releaseId, bundleUrl, status, commitBase, publishedAt","cell"),
     p("publish-ota.sh (Stage 1+2)\nrollback-ota.sh","cell_small")],
    [p("app.json","cell_code"),
     p("Contiene expo.runtimeVersion (usato per separare i cicli OTA) e expo.updates.url (endpoint backend custom)","cell"),
     p("Manuale (solo cambio ciclo)","cell_small")],
    [p("scripts/publish-ota.sh","cell_code"),
     p("Script 2-stage: export (Step A-E) + publish (Step 1-7). Gestisce backup, rollback automatico su errore e state file .local/ota-state.json","cell"),
     p("Manuale / CI","cell_small")],
    [p("scripts/validate-ota.sh","cell_code"),
     p("Pre-flight: 8 check (import, metodi Updates, CURRENT_OTA_NUMBER, PENDING, commitBase, duplicati, URL backend, live-server guard)","cell"),
     p("Manuale prima di ogni publish","cell_small")],
    [p("scripts/rollback-ota.sh","cell_code"),
     p("Riattiva una release storica tramite releaseId. Aggiorna ota-updates.json e lib/ota.ts","cell"),
     p("Manuale in caso di regressione","cell_small")],
    [p("lib/ota-check.ts","cell_code"),
     p("triggerOtaCheck(): orchestrazione check→fetch→reload con cooldown, Circuit Breaker, Probe HTTP, Deferred Reload e telemetria","cell"),
     p("(runtime client)","cell_small")],
    [p("lib/ota-hardening.ts","cell_code"),
     p("initOtaHardening(): Device ID via Extra-Params, listener rollback runtime, heartbeat post-load dopo 1500ms","cell"),
     p("(runtime client)","cell_small")],
    [p("lib/ota-stuck.ts","cell_code"),
     p("AsyncStorage: rollbackCount, stuckSessions, lastFetchedId. isOtaStuck() attiva il Circuit Breaker dopo 3 eventi","cell"),
     p("(runtime client)","cell_small")],
]

sot_col = [42*mm, 98*mm, 40*mm]
sot_table = Table(sot_data, colWidths=sot_col, style=table_style_base(BL_GREEN))
story.append(KeepTogether([sot_table]))
story.append(Spacer(1, 8))

# ── Footer ────────────────────────────────────────────────────────────────────
story.append(HRFlowable(width=W, thickness=0.5, color=BL_BORDER, spaceBefore=4, spaceAfter=4))
story.append(p(
    f"BikerLink OTA System  ·  Ciclo runtimeVersion {RV_LABEL}  ·  OTA corrente: {OTA_LABEL}  ·  "
    f"biker-link.replit.app  ·  {date.today().strftime('%d/%m/%Y')}",
    "footer"
))

# ── Build ──────────────────────────────────────────────────────────────────────
doc.build(story)
print(f"PDF generato: {OUT}")
