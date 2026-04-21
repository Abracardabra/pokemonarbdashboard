# Local Daily Auto-Run (Mac, No Manual Intervention)

This guide explains how to run `pnpm run scrape:daily` automatically every day on a local Mac using `launchd`.

## What this gives you

- Fully automatic daily scrape run on local machine
- No daily manual terminal action needed
- Logs written to files for easy troubleshooting

## 1) Create runner script

Create file:

`/Users/svl/run-pokemon-scrape.sh`

```bash
#!/bin/zsh
set -euo pipefail

cd /Users/svl/Projects/pokemonarbdashboard

# Ensure pnpm/node can be found in non-interactive launchd shells.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Optional runtime limits (adjust as needed).
export SCRAPE_DAILY_CAP=100
export SCRAPE_DELAY_MIN_MS=3000
export SCRAPE_DELAY_MAX_MS=9000

pnpm run scrape:daily >> /Users/svl/Projects/pokemonarbdashboard/logs/scrape-daily.log 2>&1
```

Then run:

```bash
chmod +x /Users/svl/run-pokemon-scrape.sh
mkdir -p /Users/svl/Projects/pokemonarbdashboard/logs
```

## 2) Create LaunchAgent

Create file:

`/Users/svl/Library/LaunchAgents/com.pokemonarbdashboard.scrape-daily.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.pokemonarbdashboard.scrape-daily</string>

    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>/Users/svl/run-pokemon-scrape.sh</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
      <key>Hour</key><integer>3</integer>
      <key>Minute</key><integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>/Users/svl/Projects/pokemonarbdashboard/logs/launchd-out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/svl/Projects/pokemonarbdashboard/logs/launchd-err.log</string>
  </dict>
</plist>
```

## 3) Activate

```bash
launchctl unload /Users/svl/Library/LaunchAgents/com.pokemonarbdashboard.scrape-daily.plist 2>/dev/null || true
launchctl load /Users/svl/Library/LaunchAgents/com.pokemonarbdashboard.scrape-daily.plist
launchctl list | rg pokemonarbdashboard
```

## 4) Test immediately

```bash
launchctl start com.pokemonarbdashboard.scrape-daily
```

Check logs:

```bash
tail -n 100 /Users/svl/Projects/pokemonarbdashboard/logs/scrape-daily.log
tail -n 100 /Users/svl/Projects/pokemonarbdashboard/logs/launchd-err.log
```

## Notes

- Machine must be on at schedule time.
- If you want a different daily time, change `Hour` and `Minute` in the plist.
- If `pnpm` is not found, confirm your local install path and update `PATH` in script.
