@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>&1 || (echo [ERROR] npm not found in PATH. Install Node.js 18+. & exit /b 1)
where cargo >nul 2>&1 || (echo [ERROR] cargo not found in PATH. Install Rust stable toolchain. & exit /b 1)

if not exist "node_modules" (
  echo [1/3] Installing root deps...
  call npm install || exit /b 1
) else (
  echo [1/3] Root deps present, skip.
)

if not exist "frontend\node_modules" (
  echo [2/3] Installing frontend deps...
  call npm --prefix frontend install || exit /b 1
) else (
  echo [2/3] Frontend deps present, skip.
)

echo [3/3] Building Tauri bundle...
call npx tauri build %* || exit /b 1

echo.
echo [OK] Output: src-tauri\target\release\bundle\
endlocal
