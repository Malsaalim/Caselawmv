#!/bin/bash
# One-time setup on a Mac: installs what fetch_sc.py needs and schedules it every day at 05:15.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
command -v python3 >/dev/null || { echo "Python 3 is not installed. Install it from https://www.python.org/downloads/ and run this again."; exit 1; }

echo "Setting up Python packages..."
python3 -m venv .venv
.venv/bin/python -m pip install --quiet --upgrade pip requests playwright

if [ ! -f config.json ]; then
  cp config.example.json config.json
  echo "Fill in your admin email and password in TextEdit, save, and close it."
  open -W -e config.json
fi

PLIST="$HOME/Library/LaunchAgents/mv.caselaw.fetch-sc.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
 <key>Label</key><string>mv.caselaw.fetch-sc</string>
 <key>ProgramArguments</key><array><string>$HERE/.venv/bin/python</string><string>$HERE/fetch_sc.py</string></array>
 <key>WorkingDirectory</key><string>$HERE</string>
 <key>StartCalendarInterval</key><dict><key>Hour</key><integer>5</integer><key>Minute</key><integer>15</integer></dict>
 <key>StandardOutPath</key><string>$HERE/launchd.log</string>
 <key>StandardErrorPath</key><string>$HERE/launchd.log</string>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Scheduled: every day at 05:15 (runs when the Mac wakes if it was asleep)."

echo "Running once now..."
.venv/bin/python fetch_sc.py
