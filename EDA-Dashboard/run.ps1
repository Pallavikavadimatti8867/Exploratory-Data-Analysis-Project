# PowerShell Launcher for EDA Dashboard
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Exploratory Data Analysis (EDA) Dashboard" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCmd = "py"
} else {
    Write-Host "[ERROR] Python was not found in your system PATH." -ForegroundColor Red
    Write-Host "Please install Python from https://www.python.org/ and check 'Add Python to PATH'." -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/2] Installing required Python libraries (Flask, Pandas, etc.)..." -ForegroundColor Yellow
& $pythonCmd -m pip install -r requirements.txt

Write-Host "`n[2/2] Opening browser at http://localhost:3000 ..." -ForegroundColor Green
Start-Process "http://localhost:3000"

Write-Host "Dashboard server is starting. Press Ctrl+C in this terminal to stop.`n" -ForegroundColor Cyan
& $pythonCmd backend/app.py
