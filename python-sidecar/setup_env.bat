@echo off
echo === SubForge Python Environment Setup ===
echo.

:: Tentar py launcher com 3.11 primeiro, depois python direto
py -3.11 --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON=py -3.11
    echo Usando py -3.11
    goto create_venv
)

python --version 2>&1 | findstr "3.11" > nul
if not errorlevel 1 (
    set PYTHON=python
    echo Usando python ^(3.11^)
    goto create_venv
)

echo [AVISO] Python 3.11 nao encontrado.
echo Tentativas: "py -3.11" e "python" nao retornaram 3.11.
echo Download: https://www.python.org/downloads/release/python-3119/
pause
exit /b 1

:create_venv
:: Criar venv com Python 3.11
echo Criando ambiente virtual...
%PYTHON% -m venv .venv

:: Ativar venv
call .venv\Scripts\activate.bat

:: Atualizar pip
python -m pip install --upgrade pip

:: Instalar dependencias
echo Instalando dependencias...
pip install -r requirements.txt

echo.
echo === Setup concluido! ===
echo Para ativar o ambiente: .venv\Scripts\activate.bat
echo Para testar: python main.py
pause
