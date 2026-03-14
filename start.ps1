# Aura Design AI - Start All Services
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "  =========================================" -ForegroundColor Cyan
Write-Host "   Aura Design AI - Starting All Services" -ForegroundColor Cyan  
Write-Host "  =========================================" -ForegroundColor Cyan
Write-Host ""

# Kill ports
@(3002, 5173) | ForEach-Object {
    $port = $_
    $pids = (netstat -ano | Select-String ":$port\s.*LISTENING" | ForEach-Object { ($_ -split '\s+')[-1] })
    foreach ($p in $pids) { if ($p -match '^\d+$') { Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue } }
}
Start-Sleep -Seconds 1

# Start backend
Write-Host "[1/2] Starting Backend on http://localhost:3002..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\backend'; `$host.UI.RawUI.WindowTitle = 'Aura Backend'; node src/app.js`""

Start-Sleep -Seconds 4

# Start frontend  
Write-Host "[2/2] Starting Frontend on http://localhost:5173..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\frontend'; `$host.UI.RawUI.WindowTitle = 'Aura Frontend'; npm run dev`""

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "  =========================================" -ForegroundColor Green
Write-Host "   Backend  → http://localhost:3002" -ForegroundColor Green
Write-Host "   Frontend → http://localhost:5173" -ForegroundColor Green
Write-Host "  =========================================" -ForegroundColor Green
Write-Host ""

# Open browser
Start-Process "http://localhost:5173"
Write-Host "  Browser opened! Press Enter to exit." -ForegroundColor Cyan
Read-Host
