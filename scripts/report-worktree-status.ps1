[CmdletBinding()]
param(
    [string]$AkumaSshTarget = $env:AKUMA_SSH_TARGET,
    [string]$RemotePath = $(if ($env:AKUMA_WORKTREE_STATUS_PATH) { $env:AKUMA_WORKTREE_STATUS_PATH } else { "/home/andreamasteri81/.local/share/akuma/bikerlink-worktree-status.json" })
)

$ErrorActionPreference = "Stop"
$repoPath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoPath

function Invoke-GitText {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $value = (& git @Arguments 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed"
    }
    return $value
}

$root = Invoke-GitText @("rev-parse", "--show-toplevel")
$branch = Invoke-GitText @("branch", "--show-current")
$remote = Invoke-GitText @("remote", "get-url", "origin")
$upstream = ""
try { $upstream = Invoke-GitText @("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}") } catch { }

$ahead = 0
$behind = 0
if ($upstream) {
    $count = Invoke-GitText @("rev-list", "--left-right", "--count", "HEAD...@{upstream}")
    $parts = $count -split "\s+"
    if ($parts.Count -eq 2) {
        $ahead = [int]$parts[0]
        $behind = [int]$parts[1]
    }
}

$changes = @(git status --porcelain=v1)
$head = Invoke-GitText @("log", "-1", "--format=%H %s")
$payload = [ordered]@{
    schema_version = 1
    observed_at = (Get-Date).ToUniversalTime().ToString("o")
    host = $env:COMPUTERNAME
    repository = $root
    remote = $remote
    branch = $branch
    upstream = $upstream
    ahead = $ahead
    behind = $behind
    dirty = ($changes.Count -gt 0)
    changes = $changes
    head = $head
}
$json = $payload | ConvertTo-Json -Compress -Depth 4

if (-not $AkumaSshTarget) {
    $localPath = Join-Path $root ".local\bikerlink-worktree-status.json"
    New-Item -ItemType Directory -Force -Path (Split-Path $localPath) | Out-Null
    [IO.File]::WriteAllText($localPath, $json + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
    Write-Warning "AKUMA_SSH_TARGET non configurato; heartbeat salvato solo in $localPath"
    exit 0
}

$tempPath = Join-Path ([IO.Path]::GetTempPath()) ("bikerlink-worktree-status-{0}.json" -f ([guid]::NewGuid()))
try {
    [IO.File]::WriteAllText($tempPath, $json + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
    & scp $tempPath ("{0}:{1}" -f $AkumaSshTarget, $RemotePath)
    if ($LASTEXITCODE -ne 0) { throw "scp heartbeat failed" }
    Write-Output ("BikerLink heartbeat uploaded to Akuma: {0}:{1}" -f $AkumaSshTarget, $RemotePath)
} finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $tempPath
}
