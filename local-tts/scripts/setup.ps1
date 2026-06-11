$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Venv = Join-Path $Root ".venv"
$Python = Join-Path $Venv "Scripts\python.exe"
$Pip = Join-Path $Venv "Scripts\pip.exe"

Set-Location $Root

if (-not (Test-Path $Venv)) {
    python -m venv $Venv
}

& $Python -m ensurepip --upgrade
& $Python -m pip install --upgrade setuptools wheel

# RTX 50-series cards need a modern CUDA build. CUDA 12.8 wheels work with the
# installed NVIDIA driver and do not require installing the CUDA toolkit.
& $Pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
& $Pip install -r (Join-Path $Root "requirements.txt")

if (-not (Test-Path (Join-Path $Root ".env"))) {
    Copy-Item (Join-Path $Root ".env.example") (Join-Path $Root ".env")
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root "data\audio") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs") | Out-Null

Write-Host "Local TTS setup complete."
Write-Host "Run once: .\scripts\run-once.ps1"
Write-Host "Install schedule: .\scripts\install-scheduled-task.ps1"
