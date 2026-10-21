"""Thin HTTP helper with retries and exponential backoff."""

from __future__ import annotations

import time

import requests

from ..log import logger

USER_AGENT = "aggregate-a/0.1 (research; https://github.com/zacmoore47/Testing)"


def get(url: str, *, params: dict | None = None, timeout: float = 30, retries: int = 3,
        headers: dict | None = None) -> requests.Response:
    hdrs = {"User-Agent": USER_AGENT, **(headers or {})}
    last: Exception | None = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=timeout, headers=hdrs)
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            last = exc
            wait = 2 ** (attempt + 1)
            logger.info("GET %s failed (%s); retry in %ss", url, exc, wait)
            if attempt < retries - 1:
                time.sleep(wait)
    assert last is not None
    raise last
