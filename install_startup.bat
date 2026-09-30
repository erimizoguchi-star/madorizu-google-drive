@echo off
REM ASCII only. Registers start_madorizu.bat to run at Windows logon.
REM Re-run itself inside "cmd /k" so the window never closes by itself,
REM even when something fails (a double-clicked batch file closes on error).
if /i not "%~1"=="--run" (
    cmd /k ""%~f0" --run"
    exit /b
)
setlocal
cd /d "%~dp0"

set "TARGET=%~dp0start_madorizu.bat"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LAUNCHER=%STARTUP%\start_madorizu.cmd"

echo === Register madorizu to start at Windows logon ===
echo Target:  %TARGET%
echo Startup: %STARTUP%
echo.

if not exist "%TARGET%" (
    echo [NG] start_madorizu.bat not found in this folder.
    goto end
)
if not exist "%STARTUP%\" (
    echo [NG] Startup folder not found.
    goto end
)

REM Remove the shortcut made by the previous version of this script, if any.
if exist "%STARTUP%\start_madorizu.lnk" del "%STARTUP%\start_madorizu.lnk"

REM Write a small launcher into the Startup folder. No PowerShell needed.
> "%LAUNCHER%" echo @echo off
>> "%LAUNCHER%" echo start "madorizu" /min /d "%~dp0." "%TARGET%"

if exist "%LAUNCHER%" (
    echo [OK] Registered: %LAUNCHER%
    echo      Content:
    type "%LAUNCHER%"
    echo.
    echo madorizu will update itself and start, minimized, at the next Windows logon.
    echo To undo: del "%LAUNCHER%"
) else (
    echo [NG] Could not write to the Startup folder.
    echo      Security software may be blocking it. Register it by hand instead:
    echo      Win+R, type shell:startup, then put a shortcut to start_madorizu.bat there.
)

:end
echo.
echo Done. You can close this window.
