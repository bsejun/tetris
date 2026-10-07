@echo off
cd /d "%~dp0"
start "" "http://127.0.0.1:8787/"
node keyboard-bridge.mjs
pause
