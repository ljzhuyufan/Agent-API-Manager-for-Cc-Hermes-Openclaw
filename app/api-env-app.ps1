<#
.SYNOPSIS
  doge API Env Manager - Desktop Application
  Launches Node.js backend + Edge App Mode window for native desktop experience.

.DESCRIPTION
  - Auto-detects and starts Node.js Web UI service (port 3987)
  - Opens Edge --app window (no address bar, app-like window)
  - Auto-cleans Node process on window close
  - Zero extra dependencies (Win11 includes Edge + WebView2)
#>

param(
  [int]$Port = 3987,
  [string]$HostAddr = "127.0.0.1",
  [int]$Width = 900,
  [int]$Height = 720
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path "$ScriptDir\.."
$ServerScript = "$ProjectRoot\webui\server.js"
$Url = "http://${HostAddr}:${Port}"

# ── Check Node.js ────────────────────────────────────
$nodeCmd = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $nodeCmd) {
  [System.Windows.Forms.MessageBox]::Show(
    "Node.js not found. Please install Node.js first.",
    "doge API Env Manager",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  )
  exit 1
}

# ── Check server.js exists ───────────────────────────
if (-not (Test-Path $ServerScript)) {
  [System.Windows.Forms.MessageBox]::Show(
    "Server script not found: $ServerScript",
    "doge API Env Manager",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  )
  exit 1
}

# ── Check if port is already in use ──────────────────
$portInUse = netstat -ano 2>$null | Select-String "${HostAddr}:${Port}"
$serverAlreadyRunning = ($portInUse -ne $null)

if (-not $serverAlreadyRunning) {
  Write-Host "Starting API Env service..." -ForegroundColor Cyan
  $procInfo = New-Object System.Diagnostics.ProcessStartInfo
  $procInfo.FileName = $nodeCmd.Source
  $procInfo.Arguments = "`"$ServerScript`""
  $procInfo.UseShellExecute = $false
  $procInfo.CreateNoWindow = $true
  $procInfo.RedirectStandardOutput = $true
  $procInfo.RedirectStandardError = $true

  $nodeProcess = [System.Diagnostics.Process]::Start($procInfo)

  # Wait for service to be ready
  Write-Host "Waiting for service to be ready..." -ForegroundColor Gray
  $ready = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $null = Invoke-WebRequest -Uri "$Url/api/targets" -UseBasicParsing -TimeoutSec 2
      $ready = $true
      break
    } catch {}
  }

  if (-not $ready) {
    [System.Windows.Forms.MessageBox]::Show(
      "Service startup timed out. Check if Node.js is working properly.",
      "doge API Env Manager",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    )
  }
  Write-Host "Service ready: $Url" -ForegroundColor Green
} else {
  Write-Host "Service already running: $Url" -ForegroundColor Green
}

# ── Launch Edge App Mode window ──────────────────────
Write-Host "Launching app window..." -ForegroundColor Cyan

$edgePath = $null
$edgePaths = @(
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:LOCALAPPDATA}\Microsoft\Edge\Application\msedge.exe"
)
foreach ($ep in $edgePaths) {
  if (Test-Path $ep) { $edgePath = $ep; break }
}

if (-not $edgePath) {
  Write-Host "Edge not found, using default browser..." -ForegroundColor Yellow
  Start-Process $Url
} else {
  $edgeArgs = @(
    "--app=$Url",
    "--window-size=$Width,$Height",
    "--disable-extensions",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check"
  )

  $edgeProcess = Start-Process -FilePath $edgePath -ArgumentList $edgeArgs -PassThru

  Write-Host "App window opened (PID: $($edgeProcess.Id))" -ForegroundColor Green
  Write-Host "Closing the window will stop the service..." -ForegroundColor Gray

  $edgeProcess.WaitForExit()
}

# ── Cleanup: Stop Node service ───────────────────────
if (-not $serverAlreadyRunning -and $nodeProcess -and -not $nodeProcess.HasExited) {
  Write-Host "Stopping service..." -ForegroundColor Yellow
  $nodeProcess.Kill($true)
  Start-Sleep -Milliseconds 500
  if (-not $nodeProcess.HasExited) {
    $nodeProcess.Kill()
  }
  # Ensure port is released
  $leftover = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.Id -eq $nodeProcess.Id
  }
  if ($leftover) {
    Stop-Process -Id $nodeProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Service stopped" -ForegroundColor Green
}
