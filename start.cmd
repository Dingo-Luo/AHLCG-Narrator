@echo off
setlocal
set "AHLCG_NODE="
where node.exe >nul 2>nul
if not errorlevel 1 set "AHLCG_NODE=node.exe"
if defined AHLCG_NODE goto run
if exist "%ProgramFiles%\nodejs\node.exe" set "AHLCG_NODE=%ProgramFiles%\nodejs\node.exe"
if defined AHLCG_NODE goto run
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "AHLCG_NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if defined AHLCG_NODE goto run
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "AHLCG_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if defined AHLCG_NODE goto run
echo No Node.js runtime found. Install Node.js 22 or newer, then run this file again.
exit /b 1

:run
echo Starting Arkham Chronicles. Keep this window open; press Ctrl+C to stop.
echo Open http://localhost:4173 ^(or the port printed below^).
"%AHLCG_NODE%" "%~dp0scripts\serve.mjs"
exit /b %errorlevel%
