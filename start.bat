@echo off
title 🎮 Pony Town - Game Server
echo ========================================================
echo   Starting 🎮 Pony Town Full Project Server...
echo ========================================================
echo.

if not exist node_modules (
    echo [Setup] Installing dependencies (first run only)...
    call npm.cmd install
)

echo [Server] Launching Node.js backend on http://localhost:3000 ...
start "" http://localhost:3000
node server.js
pause
