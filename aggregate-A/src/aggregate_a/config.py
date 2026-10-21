"""Config loading: YAML for tunables, .env for secrets."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Config:
    raw: dict[str, Any]
    root: Path

    def __getitem__(self, key: str) -> Any:
        return self.raw[key]

    def path(self, key: str) -> Path:
        p = Path(self.raw["paths"][key])
        return p if p.is_absolute() else self.root / p

    @staticmethod
    def secret(name: str) -> str | None:
        val = os.environ.get(name, "").strip()
        return val or None


def load_config(path: str | Path | None = None, root: Path | None = None) -> Config:
    root = root or PROJECT_ROOT
    load_dotenv(root / ".env", override=False)
    cfg_path = Path(path) if path else root / "config.yaml"
    with open(cfg_path) as fh:
        raw = yaml.safe_load(fh)
    return Config(raw=raw, root=root)
