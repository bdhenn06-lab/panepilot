@echo off
rem Dev-server launcher that works even before a fresh shell picks up the
rem user PATH (Node lives in dev\tools\node).
set "PATH=C:\Users\bhenn\dev\tools\node;%PATH%"
cd /d C:\Users\bhenn\dev\panepilot
npm run dev
