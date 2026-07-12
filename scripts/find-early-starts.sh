#!/usr/bin/env bash
# Find Timeslots in late schedules with start times before a given cutoff.
# Usage: ./scripts/find-early-starts.sh [cutoff]  (default: 4:45)
#
# Examples:
#   ./scripts/find-early-starts.sh        # default cutoff 4:45
#   ./scripts/find-early-starts.sh 5:00   # custom cutoff

set -euo pipefail

cutoff="${1:-4:45}"
cutoff_hour=$(echo "$cutoff" | cut -d: -f1)
cutoff_min=$(echo "$cutoff" | cut -d: -f2)
cutoff_min=${cutoff_min:-0}
cutoff_total=$((10#$cutoff_hour * 60 + 10#$cutoff_min))

found_any=false

for f in src/schedules/*-late.mdx; do
  results=$(while IFS= read -r line; do
    time=$(echo "$line" | sed -E 's/.*start="([^"]+)".*/\1/')
    hour=$(echo "$time" | cut -d: -f1)
    min=$(echo "$time" | cut -d: -f2)
    min=${min:-0}
    total=$((10#$hour * 60 + 10#$min))
    if [ "$total" -lt "$cutoff_total" ]; then
      echo "  $line"
    fi
  done < <(grep -n 'start="' "$f"))

  if [ -n "$results" ]; then
    echo "=== $(basename "$f") ==="
    echo "$results"
    echo
    found_any=true
  fi
done

if ! $found_any; then
  echo "No Timeslots with start before $cutoff found in any *-late.mdx schedule."
fi
