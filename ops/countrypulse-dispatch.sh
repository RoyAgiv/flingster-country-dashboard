#!/bin/zsh
# Dispatch the existing CountryPulse GitHub collector on the M4 gateway.
# This script does not collect, modify repository files, or store access tokens.
set -euo pipefail
export HOME="/Users/royagiv"
export PATH="/opt/homebrew/bin:/usr/bin:/bin"
export GH_HTTP_TIMEOUT="25"
State_Directory="$HOME/Library/Application Support/CountryPulse"
State_File="$State_Directory/last-successful-dispatch"
mkdir -p "$State_Directory"
Now_Seconds="$(/bin/date +%s)"
Now_Utc="$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')"
if (( $# > 0 )) && [[ "$1" == "--check" ]]; then
  /opt/homebrew/bin/gh api repos/RoyAgiv/flingster-country-dashboard/actions/workflows/collect-and-deploy.yml --jq .state
  /bin/echo "COUNTRYPULSE_AUTH_CHECK_OK $Now_Utc"
  exit 0
fi
Last_Seconds="0"
if [[ -f "$State_File" ]]; then
  Last_Seconds="$(/bin/cat "$State_File" || /bin/echo 0)"
fi
if [[ ! "$Last_Seconds" =~ '^[0-9]+$' ]]; then Last_Seconds="0"; fi
if (( Now_Seconds - Last_Seconds >= 0 && Now_Seconds - Last_Seconds < 1200 )); then
  /bin/echo "COUNTRYPULSE_SKIP_RECENT $Now_Utc age_seconds=$(( Now_Seconds - Last_Seconds ))"
  exit 0
fi
/bin/echo "COUNTRYPULSE_DISPATCH_START $Now_Utc"
/opt/homebrew/bin/gh workflow run collect-and-deploy.yml --repo RoyAgiv/flingster-country-dashboard --ref main
printf '%s\n' "$Now_Seconds" > "$State_File.tmp"
mv -f "$State_File.tmp" "$State_File"
/bin/echo "COUNTRYPULSE_DISPATCH_OK $Now_Utc"
