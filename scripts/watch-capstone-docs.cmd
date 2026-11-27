@echo off
title BYTEBOUND Capstone Documentation Live Watcher
cd /d "%~dp0.."
echo Starting BYTEBOUND live Capstone Documentation watcher...
echo Every saved file change will automatically update CAPSTONE_DOCUMENTATION.md
node "%~dp0update-capstone-docs.js" --watch
pause
