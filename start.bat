@echo off
title Overlay Server
cd /d "%~dp0"
set HOST=0.0.0.0
echo Osvobozhdaem port 3000 (ubivaem staryy node server.js, esli est)...
powershell -NoProfile -File kill_existing.ps1
timeout /t 1 >nul
echo Starting overlay server...
"C:\Program Files\nodejs\node.exe" server.js
pause