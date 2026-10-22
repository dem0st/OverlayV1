@echo off
chcp 65001 >nul
title Overlay Desktop
cd /d "%~dp0"
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [Ошибка] npm не найден. Установи Node.js: https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules\express (
  echo Установка зависимостей (первый запуск)...
  call npm.cmd install --no-audit --no-fund
)
if not exist node_modules\.bin\electron.cmd (
  echo Установка Electron (первый запуск, ~100 МБ)...
  call npm.cmd install --no-audit --no-fund --save-dev electron
)
call npm.cmd run desktop