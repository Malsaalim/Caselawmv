# Supreme Court PDF fetcher (runs on your own computer)

The Supreme Court's PDF server blocks cloud servers, so this small program runs on your own computer
once a day. It finds new Supreme Court judgments that have no legal principles yet, downloads their PDFs
and puts them in the website's inbox. The daily task at 05:54 then writes and publishes the legal principles.

## Setup (once)

1. Install Python 3 from https://www.python.org/downloads/ (on Windows, tick **Add python.exe to PATH**).
   Google Chrome or Microsoft Edge must also be installed.
2. Download and unzip `court-fetcher.zip` to a folder you will keep (for example Documents\court-fetcher).
3. **Windows:** double-click `install_windows.bat`.
   **Mac:** open Terminal, type `bash ` (with a space), drag `install_mac.sh` into the window and press Enter.
4. When the editor opens, fill in your admin email and password, save and close it.

The installer schedules the program every day at 05:15 and runs it once straight away.
If the computer is off at 05:15, Windows runs it as soon as you turn it on; a Mac runs it when it wakes from sleep.

## Settings (config.json)

- `start_date`: only judgments dated on or after this day are sent (older ones are not back-filled).
- `max_per_run`: the most PDFs sent per day (the rest follow on the next days).

## Checking it

`fetch_sc.log` in the folder lists every run. A browser window may flash briefly when the court asks for a
browser check; that is normal. To stop it: Windows, delete the task "CaseLaw MV - Supreme Court PDFs" in
Task Scheduler; Mac, run `launchctl unload ~/Library/LaunchAgents/mv.caselaw.fetch-sc.plist`.
