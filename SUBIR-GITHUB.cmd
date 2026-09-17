@echo off
title Placar - enviar pro GitHub
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0subir-github.ps1"
echo.
pause
