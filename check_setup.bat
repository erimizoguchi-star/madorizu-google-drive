@echo off
cd /d "%~dp0"
REM ASCII only.
set "PORT=8512"
echo === madorizu setup check ===
echo Folder: %CD%
echo.

where git >nul 2>nul
if errorlevel 1 (echo [NG] git not found) else (echo [OK] git & git --version)

where node >nul 2>nul
if errorlevel 1 (
    echo [NG] Node.js not found. Run: winget install OpenJS.NodeJS.LTS
) else (
    echo [OK] node
    node -v
)

git ls-remote --heads origin main >nul 2>nul
if errorlevel 1 (
    echo [NG] cannot reach GitHub repo. Check the network.
) else (
    echo [OK] GitHub repo reachable
)

if exist "package.json" (echo [OK] package.json) else (echo [NG] package.json missing)
if exist "node_modules" (echo [OK] node_modules) else (echo [INFO] node_modules not yet installed - start_madorizu.bat will install)
if exist "dist\index.html" (echo [OK] dist built) else (echo [INFO] not built yet - start_madorizu.bat will build)

if exist ".env" (
    findstr /r /c:"^GEMINI_API_KEY=AIza" .env >nul
    if errorlevel 1 (
        echo [WARN] .env exists but GEMINI_API_KEY looks empty
    ) else (
        echo [OK] .env with GEMINI_API_KEY
    )
) else (
    echo [NG] .env missing - copy .env.example .env and set GEMINI_API_KEY
)

echo.
echo Port %PORT%:
netstat -ano | findstr ":%PORT% "
if errorlevel 1 (echo [OK] port %PORT% is FREE) else (echo [INFO] port %PORT% is IN USE)

echo.
pause
