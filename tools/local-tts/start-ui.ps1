param([string]$RuntimeDir,[int]$Port=7860)
$ErrorActionPreference = 'Stop'
if (-not $RuntimeDir) {
    $state = Join-Path $PSScriptRoot 'local-state.json'
    if (-not (Test-Path -LiteralPath $state)) { throw 'Run install.ps1 first, or supply -RuntimeDir.' }
    $RuntimeDir = (Get-Content -LiteralPath $state -Raw | ConvertFrom-Json).runtimeDir
}
$python = Join-Path $RuntimeDir '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'IndexTTS Python environment is not installed.' }
Push-Location $RuntimeDir
try {
    $env:USE_MODELSCOPE='false'
    $env:PYTHONUTF8='1'
    $env:HF_HUB_OFFLINE='1'
    $env:TRANSFORMERS_OFFLINE='1'
    Write-Output "Open http://127.0.0.1:$Port after the model loads. Press Ctrl+C to stop."
    & $python (Join-Path $PSScriptRoot 'preflight.py') --runtime-dir $RuntimeDir
    if ($LASTEXITCODE -ne 0) { throw 'Model files are incomplete; review the missing-file list.' }
    & $python webui.py --version 2.5 --model_dir checkpoints --host 127.0.0.1 --port $Port --fp16
    if ($LASTEXITCODE -ne 0) { throw 'IndexTTS WebUI stopped with an error.' }
} finally { Pop-Location }
