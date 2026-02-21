@echo off
echo === SubForge PyInstaller Build ===
echo.

:: Ativar venv
call .venv\Scripts\activate.bat

:: Garantir PyInstaller instalado
pip install pyinstaller==6.13.0 -q

:: Build
echo Compilando sidecar...
pyinstaller subforge.spec --onedir --clean

if errorlevel 1 (
    echo [ERRO] Build falhou!
    pause
    exit /b 1
)

:: Copiar para src-tauri/binaries/
echo Copiando para src-tauri/binaries/...
set DEST=..\src-tauri\binaries\subforge-x86_64-pc-windows-msvc
if exist "%DEST%" rmdir /s /q "%DEST%"
xcopy /s /e /i "dist\subforge-x86_64-pc-windows-msvc" "%DEST%"

echo.
echo === Build concluido! ===
echo Sidecar em: src-tauri/binaries/subforge-x86_64-pc-windows-msvc/
pause
