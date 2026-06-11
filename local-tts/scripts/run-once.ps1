$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Python = Join-Path $Root ".venv\Scripts\python.exe"
$LogDir = Join-Path $Root "logs"
$Log = Join-Path $LogDir "batch.log"
$env:PYTHONIOENCODING = "utf-8"

if (-not (Test-Path $Python)) {
    throw "Virtualenv not found. Run .\scripts\setup.ps1 first."
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $Root

$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"`n===== $Timestamp =====" | Out-File -FilePath $Log -Append -Encoding utf8
& $Python (Join-Path $Root "generate_pronunciations.py") 2>&1 |
    Out-File -FilePath $Log -Append -Encoding utf8
$Code = $LASTEXITCODE

if ($Code -ne 0) {
    Write-Host "Batch exited with code $Code. See $Log"
    exit $Code
}

Write-Host "Batch completed. See $Log"
