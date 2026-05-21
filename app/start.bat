@echo off
:: ===================================================
::  doge API Env Manager — Desktop Application
::  双击此文件启动
:: ===================================================
title doge API Env Manager
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0api-env-app.ps1"
