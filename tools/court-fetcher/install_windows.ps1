# One-time setup on Windows: installs what fetch_sc.py needs and schedules it every day at 05:15.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

Write-Host "Setting up Python packages..."
if (Get-Command py -ErrorAction SilentlyContinue) { & py -3 -m venv .venv }
elseif (Get-Command python -ErrorAction SilentlyContinue) { & python -m venv .venv }
else { Write-Host "Python is not installed. Install it from https://www.python.org/downloads/ (tick 'Add python.exe to PATH'), then run this again."; Read-Host "Press Enter to close"; exit 1 }
& "$here\.venv\Scripts\python.exe" -m pip install --quiet --upgrade pip requests playwright

if (-not (Test-Path "$here\config.json")) {
  Copy-Item "$here\config.example.json" "$here\config.json"
  Write-Host "Fill in your admin email and password in the Notepad window, save, and close it."
  Start-Process notepad "$here\config.json" -Wait
}

$action = New-ScheduledTaskAction -Execute "$here\.venv\Scripts\pythonw.exe" -Argument "`"$here\fetch_sc.py`"" -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -Daily -At 5:15am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "CaseLaw MV - Supreme Court PDFs" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Scheduled: every day at 05:15 (or as soon as the computer is on, if it was off)."

Write-Host "Running once now..."
& "$here\.venv\Scripts\python.exe" "$here\fetch_sc.py"
Read-Host "Finished. Press Enter to close"
