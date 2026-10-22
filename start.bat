@echo off
title Overlay Server
cd /d "%~dp0"
echo Osvobozhdaem port 3000 (ubivaem staryy server, esli visit)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
timeout /t 1 >nul
echo Starting overlay server...
"C:\Program Files\nodejs\node.exe" server.js
pause
