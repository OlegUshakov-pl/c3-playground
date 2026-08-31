@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

:: C3 Playground - local dev server (Windows)
:: Serves dist/ if present, otherwise project root.
:: Tries: python -> npx serve -> error

set "PORT=8000"
if not "%~1"=="" set "PORT=%~1"

:: Detect root to serve
set "SERVE_DIR=."
if exist "dist\index.html" set "SERVE_DIR=dist"

echo.
echo  C3 Playground - Local Server
echo  ============================
echo  Serving: %SERVE_DIR%  on  http://localhost:%PORT%/
echo.

:: Warn if WASM build is missing
if not exist "build\c3c.wasm" (
    if not exist "dist\build\c3c.wasm" (
        echo  [WARN] build\c3c.wasm not found.
        echo  Run build.sh via WSL / MSYS2 / Docker first, or place a prebuilt build/ folder.
        echo  Without it the playground will hang on "Loading...".
        echo.
    )
)

:: Try python (py launcher)
where py >nul 2>&1
if %ERRORLEVEL%==0 (
    echo  [INFO] Starting with Python ^(py^)...
    echo  Press Ctrl+C to stop. Opening browser...
    start "" "http://localhost:%PORT%/"
    py -m http.server %PORT% --directory "%SERVE_DIR%"
    goto :end
)

:: Try python3/python
where python >nul 2>&1
if %ERRORLEVEL%==0 (
    echo  [INFO] Starting with Python...
    start "" "http://localhost:%PORT%/"
    python -m http.server %PORT% --directory "%SERVE_DIR%" 2>nul
    if %ERRORLEVEL%==0 goto :end
    :: fallback for older Python without --directory
    pushd "%SERVE_DIR%"
    python -m http.server %PORT%
    popd
    goto :end
)

:: Try npx serve
where npx >nul 2>&1
if %ERRORLEVEL%==0 (
    echo  [INFO] Starting with npx serve...
    start "" "http://localhost:%PORT%/"
    npx --yes serve -l %PORT% "%SERVE_DIR%"
    goto :end
)

echo  [ERROR] No suitable server found.
echo  Install one of:
echo    - Python 3 ^(https://python.org^)  - comes with "py" launcher
echo    - Node.js + serve ^(npm i -g serve^)
echo.
echo  Then run again:  start.bat [%PORT%]
pause
exit /b 1

:end
pause
endlocal
