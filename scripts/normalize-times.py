#!/usr/bin/env python3
"""Normalize time formats from Eliot schedule CSVs.

Handles two formats found in the Excel export:
  - Excel serial "HHMM": 700.0 → 7:00 AM, 730.0 → 7:30 AM, 115.0 → 1:15 PM
  - Time strings:      07:15:00 → 7:15 AM,   04:00:00 → 4:00 PM

Output convention (matching MDX start="" style):
  - Hour-boundary times drop :00:  "7" not "7:00"
  - Non-hour times keep minutes:  "7:30", "7:15"

Usage:
  python3 scripts/normalize-times.py /tmp/schedule-compare/7_10/Sunday_\(0712\).csv
  python3 scripts/normalize-times.py /tmp/schedule-compare/7_10/Sunday_\(0712\).csv --columns 0,3
"""

import argparse
import csv
import re
import sys
from pathlib import Path


def normalize_time(raw: str) -> str:
    """Normalize a time value to H:MM format, dropping :00 for hour-boundary times."""
    raw = raw.strip()
    if not raw:
        return ""

    # Try HH:MM:SS format first
    m = re.match(r"^(\d{1,2}):(\d{2}):(\d{2})$", raw)
    if m:
        hour = int(m.group(1))
        minute = int(m.group(2))
        if minute == 0:
            return f"{hour}"
        return f"{hour}:{minute:02d}"

    # Try Excel serial "HHMM" format (e.g., 700.0, 730.0, 115.0)
    try:
        num = float(raw)
    except ValueError:
        return raw  # pass through unrecognized formats

    if num == 0:
        return ""

    total_minutes = int(num)
    hour = total_minutes // 100
    minute = total_minutes % 100

    if minute >= 60:
        # e.g., 1275.0 — treat as minutes-only (edge case)
        hour = total_minutes // 60
        minute = total_minutes % 60

    if minute == 0:
        return f"{hour}"
    return f"{hour}:{minute:02d}"


def main():
    parser = argparse.ArgumentParser(description="Normalize time formats in Eliot schedule CSVs")
    parser.add_argument("input", help="Input CSV file")
    parser.add_argument(
        "--columns", "-c",
        default="0,3",
        help="Zero-indexed columns containing times to normalize (default: 0,3 = Start, End)",
    )
    parser.add_argument(
        "--output", "-o",
        help="Output file (default: print to stdout)",
    )
    args = parser.parse_args()

    columns = [int(c.strip()) for c in args.columns.split(",")]

    with open(args.input, newline="") as f:
        reader = csv.reader(f)
        rows = list(reader)

    for row in rows:
        for col in columns:
            if col < len(row) and row[col].strip():
                row[col] = normalize_time(row[col])

    out = sys.stdout if args.output is None else open(args.output, "w", newline="")
    try:
        writer = csv.writer(out)
        writer.writerows(rows)
    finally:
        if args.output:
            out.close()


if __name__ == "__main__":
    main()
