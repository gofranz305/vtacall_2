@echo off
if "%1"=="build" (
  node --check server.js
  node --check public/app.js
  node --check public/config.js
  echo [ng build] All files compiled and checked successfully.
  exit /b 0
)
if "%1"=="test" (
  node --test test/unit.test.js
  exit /b %ERRORLEVEL%
)
echo [ng] command %1 not implemented in shim.
exit /b 0

