@echo off
setlocal
cd /d "%~dp0"

echo Updating Amanda from GitHub...
git pull --ff-only origin main
if errorlevel 1 goto failed

echo.
echo Starting Amanda development build...
bun run desktop:dev
if errorlevel 1 goto failed

exit /b 0

:failed
echo.
echo Amanda could not be updated or started. Check the message above.
pause
exit /b 1
