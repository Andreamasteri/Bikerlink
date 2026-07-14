#!/usr/bin/env python3
"""Accesso autonomo al ThinkCentre (server di casa) via SSH su Cloudflare Access.

Il ThinkCentre è dietro Cloudflare Tunnel + Cloudflare Access: NON accetta
connessioni SSH dirette sulla porta 22. Ci si arriva SOLO tramite
`cloudflared access ssh` come ProxyCommand, autenticandosi all'edge Cloudflare
con il service token (CF_ACCESS_CLIENT_ID/SECRET) e loggandosi con la chiave
privata (TC_SSH_KEY). Tutte le credenziali sono GIA' nei secret dell'environment
Replit — non chiederle mai all'utente.

Uso:
  python3 .agents/skills/thinkcentre-access/tc.py status
  python3 .agents/skills/thinkcentre-access/tc.py exec "docker ps -a"
  python3 .agents/skills/thinkcentre-access/tc.py exec "systemctl restart whisper" --sudo

La chiave privata e il binario cloudflared (se scaricato on-demand) vivono in una
dir temporanea con permessi 0600 e vengono SEMPRE rimossi a fine sessione:
niente chiave o credenziale lasciata su disco o stampata nei log.
"""
import os, sys, re, stat, shutil, tempfile, subprocess, urllib.request

CF_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"


def host() -> str:
    return (os.environ.get("TC_SSH_HOST", "")
            .replace("Https://", "").replace("https://", "")
            .strip().rstrip("/"))


def normalize_key(raw: str) -> str:
    """Ricostruisce una chiave OpenSSH i cui newline sono stati collassati in
    spazi dal paste nell'UI secret. I marker BEGIN/END contengono spazi
    legittimi: si isolano via regex e si riavvolge il corpo base64 a 64 colonne.
    """
    s = raw.strip()
    if "\n" in s:
        return s if s.endswith("\n") else s + "\n"
    m = re.search(r"-----BEGIN ([A-Z0-9 ]+?)-----(.*?)-----END \1-----", s, re.S)
    if not m:
        return s if s.endswith("\n") else s + "\n"
    label = m.group(1).strip()
    body = re.sub(r"\s+", "", m.group(2))
    wrapped = "\n".join(body[i:i + 64] for i in range(0, len(body), 64))
    return f"-----BEGIN {label}-----\n{wrapped}\n-----END {label}-----\n"


def resolve_cloudflared(workdir: str) -> str:
    """Ritorna il path di cloudflared: bin/cloudflared del repo, poi PATH, poi
    scarica on-demand nella dir temporanea. Solleva se irrecuperabile."""
    baked = os.path.join(os.getcwd(), "bin", "cloudflared")
    if os.path.isfile(baked) and os.access(baked, os.X_OK):
        return baked
    found = shutil.which("cloudflared")
    if found:
        return found
    dst = os.path.join(workdir, "cloudflared")
    urllib.request.urlretrieve(CF_URL, dst)
    os.chmod(dst, os.stat(dst).st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return dst


def ssh_argv(cfbin: str, keypath: str, user: str, h: str, remote_cmd: str):
    proxy = f'{cfbin} access ssh --hostname %h'
    return [
        "ssh", "-i", keypath,
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=30",
        "-o", f"ProxyCommand={proxy}",
        f"{user}@{h}", remote_cmd,
    ]


def run(cfbin, keypath, user, h, cmd, sudo=False, timeout=90) -> str:
    if sudo:
        remote = "sudo -n bash -lc " + shell_quote(cmd)
    else:
        remote = "bash -lc " + shell_quote(cmd)
    env = dict(os.environ)
    # Service token per l'autenticazione non interattiva di cloudflared access.
    env["TUNNEL_SERVICE_TOKEN_ID"] = os.environ.get("CF_ACCESS_CLIENT_ID", "")
    env["TUNNEL_SERVICE_TOKEN_SECRET"] = os.environ.get("CF_ACCESS_CLIENT_SECRET", "")
    p = subprocess.run(
        ssh_argv(cfbin, keypath, user, h, remote),
        env=env, capture_output=True, text=True, timeout=timeout,
    )
    return (p.stdout + p.stderr).strip()


def shell_quote(s: str) -> str:
    import shlex
    return shlex.quote(s)


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

    user = os.environ.get("TC_SSH_USER")
    h = host()
    if not user or not h:
        sys.exit("TC_SSH_USER e TC_SSH_HOST devono essere configurati nei secret.")
    if not os.environ.get("TC_SSH_KEY"):
        sys.exit("TC_SSH_KEY (chiave privata OpenSSH) mancante nei secret.")
    if not os.environ.get("CF_ACCESS_CLIENT_ID") or not os.environ.get("CF_ACCESS_CLIENT_SECRET"):
        sys.exit("CF_ACCESS_CLIENT_ID/SECRET mancanti: impossibile autenticare cloudflared access.")

    workdir = tempfile.mkdtemp(prefix="tc-ssh-")
    keypath = os.path.join(workdir, "id")
    try:
        with open(keypath, "w") as f:
            f.write(normalize_key(os.environ["TC_SSH_KEY"]))
        os.chmod(keypath, 0o600)
        try:
            cfbin = resolve_cloudflared(workdir)
        except Exception as e:
            sys.exit("cloudflared non disponibile e download fallito: %s %s"
                     % (type(e).__name__, str(e)[:200]))

        if mode == "status":
            print("SSH OK ->", user + "@" + h + " (via Cloudflare Access)")
            for label, cmd in STATUS_CMDS:
                print("\n== %s ==" % label)
                print(run(cfbin, keypath, user, h, cmd))
        elif mode == "exec":
            if len(args) < 2:
                sys.exit('uso: tc.py exec "<comando>" [--sudo]')
            print(run(cfbin, keypath, user, h, args[1], sudo=sudo))
        else:
            sys.exit("modo sconosciuto: %s (usa: status | exec)" % mode)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    main()
