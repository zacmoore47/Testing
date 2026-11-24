"""
automation.py - run the daily report automatically on your Mac (portfolio app track, S4).

Uses macOS's built-in scheduler (launchd), so nothing extra needs installing. On each run
it builds the daily report, shows a desktop notification with the headline numbers, and
opens the report in your browser only when something needs your attention.

Commands (run from the panic_detector folder with the virtual environment active):
    python automation.py install --portfolio portfolios/my/my_portfolio.csv [--time 18:15]
    python automation.py status
    python automation.py run        # do one run now, exactly as the schedule would
    python automation.py uninstall

Notes:
    - Runs Monday-Friday at the chosen local time (default 18:15, after the US close).
    - If the Mac is asleep at that time, launchd runs the job when it wakes. If it is shut
      down, that day's run is skipped.
    - The first notification may need permission: System Settings > Notifications >
      Script Editor > Allow notifications.
    - Logs: outputs/logs/daily_report.log
"""
from __future__ import annotations

import argparse
import os
import platform
import plistlib
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
LABEL = "com.portfoliolab.dailyreport"
PLIST = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"
LOG = BASE / "outputs" / "logs" / "daily_report.log"
WEEKDAYS = {"mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6, "sun": 0}


def job_command(portfolio: Path) -> list[str]:
    """The exact command launchd runs: this venv's Python, absolute paths only."""
    return [sys.executable, str(BASE / "panic_detector.py"), "--report", str(portfolio),
            "--notify", "--open-on-alert"]


def build_plist(portfolio: Path, hour: int, minute: int, days: list[int]) -> dict:
    return {
        "Label": LABEL,
        "ProgramArguments": job_command(portfolio),
        "WorkingDirectory": str(BASE),
        "StartCalendarInterval": [{"Weekday": d, "Hour": hour, "Minute": minute} for d in days],
        "StandardOutPath": str(LOG),
        "StandardErrorPath": str(LOG),
        "EnvironmentVariables": {"PATH": "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin"},
        "RunAtLoad": False,
    }


def parse_time(text: str) -> tuple[int, int]:
    h, m = text.split(":")
    hour, minute = int(h), int(m)
    if not (0 <= hour < 24 and 0 <= minute < 60):
        raise ValueError("time must be HH:MM, 24-hour clock")
    return hour, minute


def parse_days(text: str) -> list[int]:
    text = text.lower().strip()
    if text in ("weekdays", "mon-fri"):
        return [1, 2, 3, 4, 5]
    if text in ("daily", "everyday"):
        return [0, 1, 2, 3, 4, 5, 6]
    return [WEEKDAYS[d.strip()[:3]] for d in text.split(",")]


def _launchctl(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["launchctl", *args], capture_output=True, text=True)


def _require_mac() -> None:
    if platform.system() != "Darwin":
        sys.exit("Scheduling uses macOS launchd and only works on a Mac. "
                 "Use 'install --dry-run' to preview the schedule file.")


def install(portfolio: Path, time_text: str, days_text: str, dry_run: bool) -> None:
    portfolio = portfolio.expanduser().resolve()
    if not portfolio.exists():
        sys.exit(f"Holdings file not found: {portfolio}\nSave your positions on the app's "
                 "Portfolio page first (a paper portfolio works too).")
    hour, minute = parse_time(time_text)
    days = parse_days(days_text)
    plist = build_plist(portfolio, hour, minute, days)
    if dry_run:
        print(plistlib.dumps(plist).decode())
        return
    _require_mac()
    LOG.parent.mkdir(parents=True, exist_ok=True)
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    domain = f"gui/{os.getuid()}"
    _launchctl("bootout", domain, str(PLIST))  # replace any previous version (ignore errors)
    PLIST.write_bytes(plistlib.dumps(plist))
    r = _launchctl("bootstrap", domain, str(PLIST))
    if r.returncode != 0:  # older macOS fallback
        r = _launchctl("load", "-w", str(PLIST))
    if r.returncode != 0:
        sys.exit(f"launchctl could not load the schedule:\n{r.stderr or r.stdout}")
    names = [k for k, v in WEEKDAYS.items() if v in days]
    print(f"Scheduled: {portfolio.name} at {hour:02d}:{minute:02d} on {', '.join(names)}.")
    print(f"Schedule file: {PLIST}\nLog: {LOG}")
    print("Test it now with:  python automation.py run")


def uninstall() -> None:
    _require_mac()
    _launchctl("bootout", f"gui/{os.getuid()}", str(PLIST))
    if PLIST.exists():
        PLIST.unlink()
        print("Daily report schedule removed.")
    else:
        print("No schedule was installed.")


def status() -> None:
    if not PLIST.exists():
        print("Not scheduled. Install with: python automation.py install --portfolio <file>")
        return
    plist = plistlib.loads(PLIST.read_bytes())
    slots = plist["StartCalendarInterval"]
    names = [k for k, v in WEEKDAYS.items() if v in {s["Weekday"] for s in slots}]
    print(f"Scheduled: {Path(plist['ProgramArguments'][3]).name} at "
          f"{slots[0]['Hour']:02d}:{slots[0]['Minute']:02d} on {', '.join(names)}")
    if platform.system() == "Darwin":
        r = _launchctl("print", f"gui/{os.getuid()}/{LABEL}")
        loaded = r.returncode == 0
        print(f"Loaded in launchd: {'yes' if loaded else 'NO (run install again)'}")
        for line in r.stdout.splitlines():
            if "last exit code" in line or "runs =" in line:
                print("  " + line.strip())
    if LOG.exists():
        tail = LOG.read_text(errors="replace").splitlines()[-8:]
        print(f"Last log lines ({LOG.name}):")
        print("\n".join("  " + t for t in tail))


def run_now() -> None:
    """One run exactly as the schedule would do it."""
    if not PLIST.exists():
        sys.exit("Not scheduled yet. Install first, or run the report directly:\n"
                 "  python panic_detector.py --report <file> --notify")
    cmd = plistlib.loads(PLIST.read_bytes())["ProgramArguments"]
    print("Running:", " ".join(cmd))
    sys.exit(subprocess.run(cmd, cwd=BASE).returncode)


def main() -> None:
    p = argparse.ArgumentParser(description="Schedule the Portfolio Lab daily report (macOS).")
    sub = p.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("install", help="schedule the daily report")
    i.add_argument("--portfolio", type=Path, required=True, help="holdings CSV in portfolios/my/")
    i.add_argument("--time", default="18:15", help="local time HH:MM (default 18:15)")
    i.add_argument("--days", default="weekdays", help="weekdays (default), daily, or e.g. mon,wed,fri")
    i.add_argument("--dry-run", action="store_true", help="print the schedule file, change nothing")
    sub.add_parser("status", help="show the schedule and recent log")
    sub.add_parser("run", help="run once now, exactly as scheduled")
    sub.add_parser("uninstall", help="remove the schedule")
    a = p.parse_args()
    if a.cmd == "install":
        install(a.portfolio, a.time, a.days, a.dry_run)
    elif a.cmd == "status":
        status()
    elif a.cmd == "run":
        run_now()
    else:
        uninstall()


if __name__ == "__main__":
    main()
