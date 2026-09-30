@echo off
setlocal
cd /d "%~dp0"
REM ASCII only (cmd.exe misreads UTF-8 text in batch files).
REM On every start: pull latest main -> install packages if changed -> build -> serve.
REM If GitHub or the build fails, it still starts the version already on this PC.

set "PORT=8512"
title madorizu - port %PORT%

echo ============================================
echo  madorizu : update and start
echo  Folder: %CD%
echo ============================================
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo [NG] git not found. Install Git for Windows.
    pause
    exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
    echo [NG] Node.js not found. Run: winget install OpenJS.NodeJS.LTS
    pause
    exit /b 1
)

REM ---- 1. Wait for the network (right after Windows starts it may not be up yet) ----
set /a TRIES=0
:waitnet
git ls-remote --heads origin main >nul 2>nul
if not errorlevel 1 goto pull
set /a TRIES+=1
if %TRIES% GEQ 12 (
    echo [WARN] GitHub is not reachable. Starting the current version without update.
    goto deps
)
echo Waiting for network... %TRIES%/12
timeout /t 5 /nobreak >nul
goto waitnet

REM ---- 2. Update to the latest main ----
:pull
echo Updating from GitHub...
git pull --ff-only origin main
if errorlevel 1 (
    echo [WARN] git pull failed. Starting the current version.
    echo        If this repeats, run: git fetch origin ^& git reset --hard origin/main
)
echo.

REM ---- 3. Install packages only when package-lock.json changed ----
:deps
fc /b package-lock.json node_modules\.installed-lock.json >nul 2>nul
if errorlevel 1 (
    echo Installing packages - npm ci. This takes a minute...
    call npm ci --no-audit --no-fund
    if errorlevel 1 (
        echo [NG] npm ci failed.
        pause
        exit /b 1
    )
    copy /y package-lock.json node_modules\.installed-lock.json >nul
)

REM ---- 4. Build ----
echo Building...
call npm run build
if errorlevel 1 (
    if exist "dist\index.html" (
        echo [WARN] Build failed. Serving the previous build.
    ) else (
        echo [NG] Build failed and no previous build exists.
        pause
        exit /b 1
    )
)
echo.

if not exist ".env" (
    echo [WARN] .env not found. AI analysis needs GEMINI_API_KEY.
    echo        Run: copy .env.example .env   then set the key.
    echo.
)

REM ---- 5. Serve (localhost only; people reach it through Cloudflare) ----
echo Open:   http://localhost:%PORT%
echo Office: https://madori.n-kyouei-system.com
echo Press Ctrl+C to stop. Do not close this window.
echo.
call npx vite preview --host 127.0.0.1 --port %PORT% --strictPort
pause
