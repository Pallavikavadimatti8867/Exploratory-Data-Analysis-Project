@echo off
title Exploratory Data Analysis (EDA) Dashboard
echo ========================================================
echo  Exploratory Data Analysis (EDA) Dashboard
echo ========================================================
echo.

:: Detect Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    py --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERROR] Python was not found in your PATH.
        echo Please ensure Python is installed and check "Add Python to PATH".
        echo You can download it from: https://www.python.org/downloads/
        pause
        exit /b 1
    ) else (
        set PYTHON_BIN=py
    )
) else (
    set PYTHON_BIN=python
)

echo [1/2] Installing required Python libraries (Flask, Pandas, etc.)...
%PYTHON_BIN% -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [NOTE] Retrying pip install with --user flag...
    %PYTHON_BIN% -m pip install --user -r requirements.txt
)

echo.
echo [2/2] Launching EDA Dashboard on http://localhost:3000 ...
start http://localhost:3000

echo.
echo Server is running! Press Ctrl+C in this window to stop.
echo.
%PYTHON_BIN% backend/app.py
pause
