@echo off
cd /d "%~dp0"
REM Create a Startup shortcut for start_madorizu.bat (ASCII only).
REM After this, madorizu updates itself from GitHub and starts whenever Windows logs on.

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%~dp0start_madorizu.bat"
set "LINK=%STARTUP%\start_madorizu.lnk"

if not exist "%TARGET%" (
    echo ERROR: start_madorizu.bat not found
    pause
    exit /b 1
)

powershell -NoProfile -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%LINK%');" ^
  "$s.TargetPath = '%TARGET%';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.WindowStyle = 7;" ^
  "$s.Save();" ^
  "Write-Host 'Startup shortcut:' '%LINK%'"

if %ERRORLEVEL%==0 (
    echo OK: start_madorizu.bat will run at Windows logon, minimized.
) else (
    echo ERROR: could not create shortcut
)

pause
