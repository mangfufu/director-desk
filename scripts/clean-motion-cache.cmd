@echo off
pwsh -NoProfile -File "%~dp0clean-motion-cache.ps1" %*
set "cleanupResult=%ERRORLEVEL%"
echo.
pause
exit /b %cleanupResult%
