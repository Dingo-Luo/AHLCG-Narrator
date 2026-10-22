param(
    [string]$RuntimeDir = (Join-Path $env:LOCALAPPDATA 'AHLCG-Narrator\IndexTTS-2.5'),
    [switch]$SkipModelDownload,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$settings = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'settings.json') -Raw | ConvertFrom-Json
$RuntimeDir = [IO.Path]::GetFullPath($RuntimeDir)
if ($CheckOnly) {
    [PSCustomObject]@{RuntimeDir=$RuntimeDir; Git=[bool](Get-Command git -ErrorAction SilentlyContinue); Uv=[bool](Get-Command uv -ErrorAction SilentlyContinue); Python=$settings.python; Model=$settings.modelRepository; DownloadsSkipped=[bool]$SkipModelDownload}
    exit 0
}
foreach ($command in @('git','uv')) { if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Install $command before running setup. See README.md." } }
function Check-Exit([string]$stage) { if ($LASTEXITCODE -ne 0) { throw "$stage failed (exit $LASTEXITCODE). Setup stopped; see the command output." } }
if (Test-Path -LiteralPath (Join-Path $RuntimeDir '.git')) {
    $actual = & git -C $RuntimeDir rev-parse HEAD
    Check-Exit 'Checking existing checkout'
    if ($actual -ne $settings.codeRevision) { throw 'Existing runtime is a different revision. Choose a new -RuntimeDir; no files were reset.' }
} else {
    if ((Test-Path -LiteralPath $RuntimeDir) -and (Get-ChildItem -LiteralPath $RuntimeDir -Force | Select-Object -First 1)) { throw 'Runtime directory is not empty. Choose another -RuntimeDir.' }
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
    & git -C $RuntimeDir init
    Check-Exit 'Creating isolated checkout'
    & git -C $RuntimeDir remote add origin $settings.repository
    Check-Exit 'Setting official repository'
    & git -C $RuntimeDir fetch --depth 1 origin $settings.codeRevision
    Check-Exit 'Downloading pinned source'
    & git -C $RuntimeDir checkout --detach FETCH_HEAD
    Check-Exit 'Selecting pinned source'
}
$env:UV_PYTHON_INSTALL_DIR = Join-Path $RuntimeDir '.python'
# Short build paths avoid Windows MAX_PATH errors seen with antlr4 source builds.
$env:UV_CACHE_DIR = Join-Path $env:TEMP 'ahlcg-indextts-uv'
$env:UV_LINK_MODE = 'copy'
$env:UV_SYSTEM_CERTS = 'true'
$python = Join-Path $RuntimeDir '.venv\Scripts\python.exe'
# Conda can export a CA bundle that overrides --system-certs in uv.
# Use Windows trust for this installer only, then restore the caller's values.
$certificateOverrides = @{}
foreach ($name in @('SSL_CERT_FILE','SSL_CERT_DIR')) {
    $certificateOverrides[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    if ($certificateOverrides[$name]) { Write-Output "Temporarily using Windows certificate trust instead of $name." }
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}
Push-Location $RuntimeDir
try {
    if (-not (Test-Path -LiteralPath $python)) {
        & uv --system-certs venv --python $settings.python '.venv'
        Check-Exit 'Creating Python environment'
    }
    & uv --system-certs pip install --python $python 'antlr4-python3-runtime==4.9.3'
    Check-Exit 'Building Windows-compatible dependency'
    & uv --system-certs sync --frozen --extra webui --python $settings.python
    Check-Exit 'Installing pinned dependencies'
    & uv --system-certs pip install --python $python 'imageio-ffmpeg==0.6.0'
    Check-Exit 'Installing local MP3 encoder'
    & $python -c "import torch; print('PyTorch:',torch.__version__); print('CUDA available:',torch.cuda.is_available()); print('GPU:',torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU only')"
    Check-Exit 'Checking PyTorch'
    $state = @{runtimeDir=$RuntimeDir;codeRevision=$settings.codeRevision;modelRevision=$settings.modelRevision}
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'local-state.json'),($state | ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
    if (-not $SkipModelDownload) {
        & $python (Join-Path $PSScriptRoot 'download-models.py') --runtime-dir $RuntimeDir
        Check-Exit 'Downloading checkpoints (security-gateway restrictions require IT approval)'
    }
} finally {
    Pop-Location
    foreach ($name in $certificateOverrides.Keys) {
        [Environment]::SetEnvironmentVariable($name, $certificateOverrides[$name], 'Process')
    }
}
Write-Output "Environment ready: $RuntimeDir"
if ($SkipModelDownload) { Write-Output 'Model downloads skipped. Supply approved checkpoints before launching or generating.' }
Write-Output 'Next: run start-ui.ps1, or generate.ps1 for a numbered narration sample.'
