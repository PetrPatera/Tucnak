@echo off
title Tucnakuv Svet Server
cd /d "%~dp0"
echo Spusteni aplikacniho serveru Tucnakuv svet (HTTPS)...
echo Otevirani prohlizece na https://localhost:3000/ ...

:: Cekani 2 sekundy na nabehnuti Vite serveru a otevreni HTTPS prohlizece
start /b cmd /c "timeout /t 2 /nobreak >nul && start https://localhost:3000/"

:: Spusteni Vite dev serveru
call npm run dev
pause
