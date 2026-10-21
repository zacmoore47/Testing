"""Logging plus a per-run source-health record (what was fetched, from where, how stale)."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

logger = logging.getLogger("aggregate_a")


def setup_logging(level: int = logging.INFO) -> None:
    logging.basicConfig(
        level=level, format="%(asctime)s %(levelname)s %(name)s: %(message)s", force=True
    )


@dataclass
class SourceStatus:
    source: str
    status: str  # "fresh" | "cache" | "failed" | "skipped"
    rows: int = 0
    first: str | None = None
    last: str | None = None
    detail: str = ""


@dataclass
class HealthLog:
    started: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    sources: list[SourceStatus] = field(default_factory=list)

    def record(self, status: SourceStatus) -> None:
        level = logging.WARNING if status.status in ("failed", "cache") else logging.INFO
        logger.log(level, "source %s: %s rows=%d %s..%s %s", status.source, status.status,
                   status.rows, status.first, status.last, status.detail)
        self.sources.append(status)

    def failed(self) -> list[str]:
        return [s.source for s in self.sources if s.status == "failed"]

    def write(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a") as fh:
            fh.write(json.dumps({"started": self.started,
                                 "sources": [asdict(s) for s in self.sources]}) + "\n")


HEALTH = HealthLog()
