param(
    [string]$Id='2-0-0-1-1',
    [string]$RuntimeDir,
    [string]$Reference,
    [string]$EmotionText,
    [switch]$Force,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
if (-not $RuntimeDir) {
    $state = Join-Path $PSScriptRoot 'local-state.json'
    if (-not (Test-Path -LiteralPath $state)) { throw 'Run install.ps1 first, or supply -RuntimeDir.' }
    $RuntimeDir = (Get-Content -LiteralPath $state -Raw | ConvertFrom-Json).runtimeDir
}
$python = Join-Path $RuntimeDir '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'IndexTTS Python environment is not installed.' }
$arguments = @((Join-Path $PSScriptRoot 'generate.py'),'--runtime-dir',$RuntimeDir,'--id',$Id)
if ($Reference) { $arguments += @('--reference',([IO.Path]::GetFullPath($Reference))) }
if ($EmotionText) { $arguments += @('--emotion-text',$EmotionText) }
if ($Force) { $arguments += '--force' }
if ($CheckOnly) { $arguments += '--check-only' }
$env:PYTHONUTF8='1'
& $python @arguments
if ($LASTEXITCODE -ne 0) { throw 'Narration generation did not complete; see the error above.' }
