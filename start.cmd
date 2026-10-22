@echo off
chcp 65001 >nul
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
echo 未找到 Node.js。请安装 22 或更新版本，然后重新运行。
exit /b 1

:run
echo 正在启动诡镇档案。请保持窗口开启；按 Ctrl+C 停止。
echo 请打开 http://localhost:4173 ^（或下方显示的端口）。
"%AHLCG_NODE%" "%~dp0scripts\serve.mjs"
exit /b %errorlevel%
