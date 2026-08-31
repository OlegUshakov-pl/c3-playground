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

:: Auto-download prebuilt WASM if missing (so Initialization failed doesn't happen)
if not exist "build\c3c.wasm" (
    if not exist "dist\build\c3c.wasm" (
        echo  [WARN] build\c3c.wasm not found - downloading prebuilt compiler from GitHub Pages...
        echo        ^(36 MB wasm + ~8 MB data, first run only^)
        echo.
        if not exist "build" mkdir "build" 2>nul
        set "PRIMARY_URL=https://olegushakov-pl.github.io/c3-playground/build"
        set "FALLBACK_URL=https://manulinares.github.io/c3-playground/build"
        set "DL_OK=1"
        where curl.exe >nul 2>&1
        if !ERRORLEVEL!==0 (
            echo  [DL] Trying %PRIMARY_URL% ...
            echo  [DL] c3c.wasm ^(36 MB^)...
            curl.exe -L --progress-bar -o "build\c3c.wasm" "%PRIMARY_URL%/c3c.wasm"
            if !ERRORLEVEL! neq 0 set "DL_OK=0"
            :: fallback if file is HTML 404 page (size ^< 1MB for wasm)
            for %%I in ("build\c3c.wasm") do if %%~zI LSS 1000000 set "DL_OK=0"
            if "!DL_OK!"=="0" (
                echo  [WARN] Primary source failed, trying fallback %FALLBACK_URL% ...
                set "DL_OK=1"
                curl.exe -L --progress-bar -o "build\c3c.wasm" "%FALLBACK_URL%/c3c.wasm"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
                curl.exe -L --progress-bar -o "build\c3c.data" "%FALLBACK_URL%/c3c.data"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
                curl.exe -L --progress-bar -o "build\c3c.js" "%FALLBACK_URL%/c3c.js"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
                curl.exe -L --progress-bar -o "build\emscripten_runtime.js" "%FALLBACK_URL%/emscripten_runtime.js"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
            ) else (
                echo  [DL] c3c.data ^(7 MB^)...
                curl.exe -L --progress-bar -o "build\c3c.data" "%PRIMARY_URL%/c3c.data"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
                echo  [DL] c3c.js...
                curl.exe -L --progress-bar -o "build\c3c.js" "%PRIMARY_URL%/c3c.js"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
                echo  [DL] emscripten_runtime.js...
                curl.exe -L --progress-bar -o "build\emscripten_runtime.js" "%PRIMARY_URL%/emscripten_runtime.js"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
            )
        ) else (
            echo  [DL] curl not found, trying PowerShell...
            powershell -Command "try { Invoke-WebRequest -Uri '%PRIMARY_URL%/c3c.wasm' -OutFile 'build\c3c.wasm' } catch { exit 1 }"
            if !ERRORLEVEL! neq 0 set "DL_OK=0"
            for %%I in ("build\c3c.wasm") do if %%~zI LSS 1000000 set "DL_OK=0"
            if "!DL_OK!"=="0" (
                echo  [WARN] Primary source failed, trying fallback...
                set "DL_OK=1"
                powershell -Command "Invoke-WebRequest -Uri '%FALLBACK_URL%/c3c.wasm' -OutFile 'build\c3c.wasm'"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
                powershell -Command "Invoke-WebRequest -Uri '%FALLBACK_URL%/c3c.data' -OutFile 'build\c3c.data'"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
                powershell -Command "Invoke-WebRequest -Uri '%FALLBACK_URL%/c3c.js' -OutFile 'build\c3c.js'"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
                powershell -Command "Invoke-WebRequest -Uri '%FALLBACK_URL%/emscripten_runtime.js' -OutFile 'build\emscripten_runtime.js'"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
            ) else (
                powershell -Command "Invoke-WebRequest -Uri '%PRIMARY_URL%/c3c.data' -OutFile 'build\c3c.data'"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
                powershell -Command "Invoke-WebRequest -Uri '%PRIMARY_URL%/c3c.js' -OutFile 'build\c3c.js'"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
                powershell -Command "Invoke-WebRequest -Uri '%PRIMARY_URL%/emscripten_runtime.js' -OutFile 'build\emscripten_runtime.js'"
                if !ERRORLEVEL! neq 0 set "DL_OK=0"
            )
        )
        if "!DL_OK!"=="1" (
            echo.
            echo  [OK] Prebuilt compiler downloaded to build/.
            echo.
        ) else (
            echo.
            echo  [ERROR] Failed to download prebuilt build/. Check internet connection.
            echo  Alternatively build locally:  wsl bash build.sh Release latest
            echo.
        )
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
