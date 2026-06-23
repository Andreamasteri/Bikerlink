#!/usr/bin/env python3
"""Accesso autonomo al ThinkCentre (server di casa) via SSH.

Le credenziali sono GIA' nei secret dell'environment Replit — non chiederle mai
all'utente. Uso:

  python3 .agents/skills/thinkcentre-access/tc.py status
  python3 .agents/skills/thinkcentre-access/tc.py exec "docker ps -a"
  python3 .agents/skills/thinkcentre-access/tc.py exec "systemctl restart whisper" --sudo

La password viene letta da env e passata via stdin (mai negli argv/nei log).
"""
import os, sys, shlex

try:
    import paramiko
except ImportError:
    sys.exit("paramiko mancante: esegui  installLanguagePackages('python3', 'paramiko')")


def connect(timeout=20):
    host = os.environ["TC_SSH_HOST"].replace("Https://", "").replace("https://", "").strip().rstrip("/")
    user = os.environ["TC_SSH_USER"]
    pwd = os.environ.get("TC_SSH_PASSWORD")
    port = int(os.environ.get("TC_SSH_PORT", "22"))
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, port=port, username=user, password=pwd,
              timeout=timeout, banner_timeout=timeout, auth_timeout=timeout)
    return c, pwd


def run(c, pwd, cmd, sudo=False, timeout=60):
    if sudo:
        full = "sudo -S -p '' bash -lc %s" % shlex.quote(cmd)
        stdin, out, err = c.exec_command(full, timeout=timeout)
        stdin.write(pwd + "\n")
        stdin.flush()
    else:
        full = "bash -lc %s" % shlex.quote(cmd)
        _, out, err = c.exec_command(full, timeout=timeout)
    return (out.read().decode(errors="replace") + err.read().decode(errors="replace")).strip()


STATUS_CMDS = [
    ("uptime / load", "uptime"),
    ("memoria", "free -h | head -2"),
    ("docker", "docker ps -a --format '{{.Names}}  {{.Status}}'"),
    ("ollama (systemd)", "systemctl is-active ollama"),
    ("cloudflared (tunnel)", "systemctl is-active cloudflared"),
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
        c, pwd = connect()
    except Exception as e:
        sys.exit("SSH FALLITO: %s %s\n(host LAN/Tailscale non risolvibile? deve essere il DuckDNS pubblico, schema strippato)" % (type(e).__name__, str(e)[:200]))
    try:
        if mode == "status":
            print("SSH OK ->", os.environ["TC_SSH_USER"] + "@thinkcentre")
            for label, cmd in STATUS_CMDS:
                print("\n== %s ==" % label)
                print(run(c, pwd, cmd))
        elif mode == "exec":
            if len(args) < 2:
                sys.exit('uso: tc.py exec "<comando>" [--sudo]')
            print(run(c, pwd, args[1], sudo=sudo))
        else:
            sys.exit("modo sconosciuto: %s (usa: status | exec)" % mode)
    finally:
        c.close()


if __name__ == "__main__":
    main()
