"""Helion Python helper — REST only. Live physics still runs in a browser."""

from __future__ import annotations

import json
import urllib.request


class Helion:
    def __init__(self, origin: str, token: str = "") -> None:
        self.origin = origin.rstrip("/")
        self.token = token

    def _req(self, path: str, data: dict | None = None):
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        body = None
        if data is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(data).encode()
        req = urllib.request.Request(self.origin + path, data=body, headers=headers)
        with urllib.request.urlopen(req) as res:
            return json.load(res)

    def meta(self):
        return self._req("/api/v1/meta")

    def library(self):
        return self._req("/api/v1/library")

    def creations(self):
        return self._req("/api/v1/creations")

    def save(self, name: str, config: dict):
        return self._req("/api/v1/creations", {"name": name, "config": config})

    def control(self, payload: dict):
        return self._req("/api/v1/control", payload)
