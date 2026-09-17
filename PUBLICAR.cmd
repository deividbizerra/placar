@echo off
title Placar - publicar na Cloudflare
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"
echo.
pause
