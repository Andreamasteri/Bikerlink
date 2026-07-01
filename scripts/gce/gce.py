#!/usr/bin/env python3
"""Accesso autonomo dell'agente alla VM Google Cloud e2-micro "dragonfly" (Task #5289).

A differenza di Ares (LAN-only, via ThinkCentre come jump host), questa VM ha un
IP PUBBLICO raggiungibile direttamente dalla sandbox Replit: connessione diretta
con chiave, NIENTE ProxyJump.

Secret/env usati (mai stampati):
  GCE_SSH_KEY   → chiave PRIVATA ed25519 dell'agente (PEM/OpenSSH)
  GCE_SSH_HOST  → IP esterno effimero della VM (se cambia, aggiornare il secret)
  GCE_SSH_USER  → utente Linux dell'agente (default: bikerlink)
  GCE_SSH_PORT  → porta SSH (default: 22)

Uso:
  python3 scripts/gce/gce.py status
  python3 scripts/gce/gce.py exec "uname -a"
  python3 scripts/gce/gce.py exec "apt-get update" --sudo
"""
import io
import os
import shlex
import sys

try:
    import paramiko
except ImportError:
    sys.exit("paramiko mancante: esegui  installLanguagePackages('python3', 'paramiko')")

GCE_USER = os.environ.get("GCE_SSH_USER", "bikerlink")


def _normalize_pem(raw: str) -> str:
    """Ricostruisce un PEM valido se il paste ha collassato i newline in spazi
    (capita con alcuni flussi di incolla dei secret)."""
    raw = raw.strip()
    if "\n" in raw:
        return raw
    import re

    m = re.match(r"^(-----BEGIN [^-]+-----)\s*(.*?)\s*(-----END [^-]+-----)$", raw)
    if not m:
        return raw
    header, body, footer = m.groups()
    body = "".join(body.split())  # rimuove tutti gli spazi residui nel base64
    wrapped = "\n".join(body[i : i + 70] for i in range(0, len(body), 70))
    return "%s\n%s\n%s\n" % (header, wrapped, footer)


def _load_key():
    raw = os.environ.get("GCE_SSH_KEY")
    if not raw:
        sys.exit("GCE_SSH_KEY mancante: imposta il secret con la chiave privata dell'agente.")
    raw = _normalize_pem(raw)
    buf = io.StringIO(raw)
    # ed25519 atteso; fallback ai tipi comuni se la chiave fosse di altro tipo.
    for loader in (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey):
        try:
            buf.seek(0)
            return loader.from_private_key(buf)
        except paramiko.SSHException:
            continue
    sys.exit("GCE_SSH_KEY non valida o formato non supportato.")


def connect(timeout=20):
    host = os.environ.get("GCE_SSH_HOST", "").strip()
    if not host:
        sys.exit("GCE_SSH_HOST mancante: imposta il secret con l'IP esterno della VM.")
    pkey = _load_key()
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        host,
        port=int(os.environ.get("GCE_SSH_PORT", "22")),
        username=GCE_USER,
        pkey=pkey,
        timeout=timeout,
        banner_timeout=timeout,
        auth_timeout=timeout,
    )
    return c, host


def _run(client, cmd, sudo=False, timeout=120):
    if sudo:
        # sudo NOPASSWD atteso per l'utente agente durante il setup.
        full = "sudo -n bash -lc %s" % shlex.quote(cmd)
    else:
        full = "bash -lc %s" % shlex.quote(cmd)
    _, out, err = client.exec_command(full, timeout=timeout)
    return (out.read().decode(errors="replace") + err.read().decode(errors="replace")).strip()


STATUS_CMDS = [
    ("uname", "uname -a"),
    ("uptime / load", "uptime"),
    ("memoria + swap", "free -h"),
    ("disco", "df -h / 2>/dev/null | tail -1"),
    ("dragonfly (systemd)", "systemctl is-active dragonfly 2>/dev/null || echo n/a"),
    ("dragonfly PING", "redis-cli -p 6379 PING 2>/dev/null || echo 'redis-cli n/a'"),
]


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help", "help"):
        print(__doc__)
        return
    sudo = "--sudo" in args
    args = [a for a in args if a != "--sudo"]
    mode = args[0]

    try:
        c, host = connect()
    except SystemExit:
        raise
    except Exception as e:
        sys.exit("SSH GCE FALLITO (%s): %s" % (type(e).__name__, str(e)[:200]))
    try:
        if mode == "status":
            print("SSH OK -> %s@%s (VM Google, diretto)" % (GCE_USER, host))
            for label, cmd in STATUS_CMDS:
                print("\n== %s ==" % label)
                print(_run(c, cmd))
        elif mode == "exec":
            if len(args) < 2:
                sys.exit('uso: gce.py exec "<comando>" [--sudo]')
            print(_run(c, args[1], sudo=sudo))
        else:
            sys.exit("modo sconosciuto: %s (usa: status | exec)" % mode)
    finally:
        c.close()


if __name__ == "__main__":
    main()
