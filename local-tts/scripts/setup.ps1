$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Venv = Join-Path $Root ".venv"
$Python = Join-Path $Venv "Scripts\python.exe"
$Vendor = Join-Path (Split-Path -Parent $Root) "third_party\voxcpm"
$BuildVenv = Join-Path $Root ".build-voxcpm"
$BuildPython = Join-Path $BuildVenv "Scripts\python.exe"
$Wheelhouse = Join-Path $Root ".wheelhouse"

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable exited with code $LASTEXITCODE" }
}

Set-Location $Root

if ((Test-Path $Venv) -or (Test-Path $BuildVenv)) {
    throw "Use a fresh isolated checkout for this inference-only setup. Existing environments are preserved; installing over them could retain vulnerable optional dependencies."
}
Invoke-Checked python @("-c", "import sys; assert sys.version_info[:2] == (3, 11), 'Local TTS lock requires Python 3.11'")
Invoke-Checked python @("-m", "venv", $BuildVenv)
Invoke-Checked $BuildPython @("-m", "pip", "install", "--disable-pip-version-check", "-r", (Join-Path $Vendor "build-requirements-lock.txt"))
Invoke-Checked $BuildPython @((Join-Path $Vendor "build_local.py"), "--output", $Wheelhouse, "--cache", (Join-Path $Root ".voxcpm-source-cache"))
Invoke-Checked python @("-m", "venv", $Venv)
# The reviewed Windows/Python 3.11 lock includes CUDA 13.0 wheels and installer
# tools. NVIDIA driver 580+ is required for GPU execution. TorchCodec audio
# decoding also needs FFmpeg shared DLLs; see the isolated migration report.
# Keep this in sync with requirements.txt; do not float the GPU stack.
$Wheel = Join-Path $Wheelhouse "voxcpm-2.0.3+hoshikuzu.1-py3-none-any.whl"
Invoke-Checked $Python @("-m", "pip", "install", "--disable-pip-version-check", $Wheel, "-r", (Join-Path $Root "requirements-lock.txt"), "--extra-index-url", "https://download.pytorch.org/whl/cu130")
Invoke-Checked $Python @("-m", "pip", "check")

if (-not (Test-Path (Join-Path $Root ".env"))) {
    Copy-Item (Join-Path $Root ".env.example") (Join-Path $Root ".env")
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root "data\audio") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs") | Out-Null

Write-Host "Local TTS setup complete."
Write-Host "Run once: .\scripts\run-once.ps1"
Write-Host "Install schedule: .\scripts\install-scheduled-task.ps1"
