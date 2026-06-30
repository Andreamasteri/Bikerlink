#!/usr/bin/env python3
"""Accesso autonomo ad Ares-Linux via ThinkCentre come jump host (Task #5259).

Ares è LAN-only: l'agente NON lo raggiunge direttamente dalla sandbox Replit.
Si entra prima sul ThinkCentre (secret TC_SSH_*, già presenti) e da lì si apre
un canale verso Ares sulla LAN usando la chiave dedicata dell'agente.

Secret/env usati (mai stampati):
  TC_SSH_HOST/USER/PASSWORD/PORT  → connessione al ThinkCentre (jump host)
  ARES_SSH_KEY                    → chiave PRIVATA ed25519 dell'agente (PEM)
  ARES_LAN_IP   (opzionale)       → IP LAN di Ares; se assente lo si risolve
                                    sul TC dalla neighbor table via MAC
  ARES_MAC      (opzionale)       → MAC di Ares per la risoluzione IP
  ARES_USER     (opzionale)       → utente agente su Ares (default: ares-agent)

Uso:
  python3 scripts/thinkcentre/ares/ares.py status
  python3 scripts/thinkcentre/ares/ares.py exec "free -h && ollama ps"
  python3 scripts/thinkcentre/ares/ares.py exec "apt-get update" --sudo
  python3 scripts/thinkcentre/ares/ares.py ip      # solo risolvi/mostra l'IP
"""
import io
import os
import shlex
import sys

try:
    import paramiko
except ImportError:
    sys.exit("paramiko mancante: esegui  installLanguagePackages('python3', 'paramiko')")

ARES_USER = os.environ.get("ARES_USER", "ares-agent")
# MAC WiFi storico di Ares (vedi wake-ares.sh). Override via ARES_MAC se la NIC
# attiva su Linux è un'altra (es. ethernet).
DEFAULT_MAC = "A8:E2:91:2C:90:6A"


def _tc_host() -> str:
    return (
        os.environ["TC_SSH_HOST"]
        .replace("Https://", "")
        .replace("https://", "")
        .strip()
        .rstrip("/")
    )


def connect_tc(timeout=20):
    pwd = os.environ.get("TC_SSH_PASSWORD")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        _tc_host(),
        port=int(os.environ.get("TC_SSH_PORT", "22")),
        username=os.environ["TC_SSH_USER"],
        password=pwd,
        timeout=timeout,
        banner_timeout=timeout,
        auth_timeout=timeout,
    )
    return c, pwd


def _run(client, cmd, pwd=None, sudo=False, timeout=120):
    if sudo:
        full = "sudo -S -p '' bash -lc %s" % shlex.quote(cmd)
        stdin, out, err = client.exec_command(full, timeout=timeout)
        if pwd:
            stdin.write(pwd + "\n")
            stdin.flush()
    else:
        full = "bash -lc %s" % shlex.quote(cmd)
        _, out, err = client.exec_command(full, timeout=timeout)
    return (out.read().decode(errors="replace") + err.read().decode(errors="replace")).strip()


def resolve_ares_ip(tc, pwd) -> str:
    """IP LAN di Ares: env ARES_LAN_IP, altrimenti dalla neighbor table del TC."""
    env_ip = os.environ.get("ARES_LAN_IP", "").strip()
    if env_ip:
        return env_ip
    mac = os.environ.get("ARES_MAC", DEFAULT_MAC).lower()
    # `ip neigh` sul TC: cerca il MAC e ritorna l'IP associato.
    out = _run(tc, "ip neigh show", pwd=pwd)
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[4].lower() == mac:
            return parts[0]
    raise SystemExit(
        "IP di Ares non trovato nella neighbor table del TC.\n"
        "Sveglialo (wake-ares.sh) e riprova, oppure passa ARES_LAN_IP=<ip>.\n"
        "MAC cercato: %s (override con ARES_MAC)." % mac
    )


def connect_ares(timeout=20):
    if not os.environ.get("ARES_SSH_KEY"):
        sys.exit("ARES_SSH_KEY mancante: imposta il secret con la chiave privata dell'agente.")
    tc, pwd = connect_tc(timeout)
    ares_ip = resolve_ares_ip(tc, pwd)
    transport = tc.get_transport()
    chan = transport.open_channel("direct-tcpip", (ares_ip, 22), ("127.0.0.1", 0))
    pkey = paramiko.Ed25519Key.from_private_key(io.StringIO(os.environ["ARES_SSH_KEY"]))
    ares = paramiko.SSHClient()
    ares.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ares.connect(
        ares_ip,
        port=22,
        username=ARES_USER,
        pkey=pkey,
        sock=chan,
        timeout=timeout,
        banner_timeout=timeout,
        auth_timeout=timeout,
    )
    return tc, ares, ares_ip


STATUS_CMDS = [
    ("uptime / load", "uptime"),
    ("memoria + swap", "free -h"),
    ("disco", "df -h / 2>/dev/null | tail -1"),
    ("ollama (systemd)", "systemctl is-active ollama 2>/dev/null || echo n/a"),
    ("ollama ps", "ollama ps 2>/dev/null || echo 'ollama non installato'"),
    ("cloudflared", "systemctl is-active cloudflared 2>/dev/null || echo n/a"),
    ("wol", "for i in $(ls /sys/class/net | grep -v lo); do echo -n \"$i: \"; ethtool $i 2>/dev/null | awk '/Wake-on:/{print $2}'; done"),
]


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help", "help"):
        print(__doc__)
        return
    sudo = "--sudo" in args
    args = [a for a in args if a != "--sudo"]
    mode = args[0]

    if mode == "ip":
        tc, pwd = connect_tc()
        try:
            print(resolve_ares_ip(tc, pwd))
        finally:
            tc.close()
        return

    try:
        tc, ares, ares_ip = connect_ares()
    except SystemExit:
        raise
    except Exception as e:
        sys.exit("SSH ARES FALLITO (%s): %s" % (type(e).__name__, str(e)[:200]))
    pwd = os.environ.get("TC_SSH_PASSWORD")  # non usato per Ares (key-based)
    try:
        if mode == "status":
            print("SSH OK -> %s@%s (via ThinkCentre)" % (ARES_USER, ares_ip))
            for label, cmd in STATUS_CMDS:
                print("\n== %s ==" % label)
                print(_run(ares, cmd))
        elif mode == "exec":
            if len(args) < 2:
                sys.exit('uso: ares.py exec "<comando>" [--sudo]')
            # sudo su Ares è NOPASSWD durante il setup → niente password necessaria
            print(_run(ares, args[1], sudo=sudo))
        else:
            sys.exit("modo sconosciuto: %s (usa: status | exec | ip)" % mode)
    finally:
        ares.close()
        tc.close()


if __name__ == "__main__":
    main()
