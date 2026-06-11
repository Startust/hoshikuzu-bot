$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$RunOnce = Join-Path $Root "scripts\run-once.cmd"
$TaskName = "Hoshikuzu Pronunciation Batch"
$Cmd = "$env:SystemRoot\System32\cmd.exe"

if (-not (Test-Path $RunOnce)) {
    throw "run-once.ps1 not found."
}

$Action = New-ScheduledTaskAction `
    -Execute $Cmd `
    -Argument "/c `"$RunOnce`""
$LogonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$RepeatTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 30) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger @($LogonTrigger, $RepeatTrigger) `
    -Settings $Settings `
    -Description "Generates missing player name pronunciation audio for hoshikuzu-bot." `
    -Force | Out-Null

Write-Host "Installed scheduled task: $TaskName"
Write-Host "Start it now with: Start-ScheduledTask -TaskName `"$TaskName`""
