# Step 5b — Disabilita Fast Startup / ibernazione su Windows.
# Prerequisito per montare l'NVMe NTFS r/w da Linux (ntfs3).
# L'AGENTE lo esegue via SSH una volta che OpenSSH Server su Windows è attivo:
#   ssh <utente>@<ip-windows> powershell -Command "powercfg /h off"
# (qui come script di riferimento, da lanciare in PowerShell admin)
powercfg /hibernate off
Write-Output "Fast Startup / ibernazione DISATTIVATA. Riavvia Windows una volta."
