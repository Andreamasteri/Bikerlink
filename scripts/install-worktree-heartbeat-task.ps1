[CmdletBinding()]
param(
    [string]$AkumaSshTarget = $env:AKUMA_SSH_TARGET,
    [string]$TaskName = "BikerLink worktree heartbeat"
)

$ErrorActionPreference = "Stop"
if (-not $AkumaSshTarget) {
    throw "Impostare AKUMA_SSH_TARGET, ad esempio andreamasteri81@akumaos"
}

$scriptPath = Join-Path $PSScriptRoot "report-worktree-status.ps1"
$actionArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -AkumaSshTarget `"$AkumaSshTarget`""
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument $actionArguments
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$triggerDaily = New-ScheduledTaskTrigger -Daily -At 08:05
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType InteractiveToken -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($triggerLogon, $triggerDaily) -Principal $principal -Settings $settings -Force | Out-Null
Write-Output "Scheduled Task installato: $TaskName"
Write-Output "Target Akuma: $AkumaSshTarget"
