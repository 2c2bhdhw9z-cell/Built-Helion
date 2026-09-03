"""Helion Python helper — REST only. Live physics still runs in a Helion lab."""

from __future__ import annotations

import json
import urllib.request


class Helion:
    def __init__(self, origin: str, token: str = "") -> None:
        self.origin = origin.rstrip("/")
        self.token = token

    def _req(self, path: str, data: dict | None = None, method: str | None = None):
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        body = None
        verb = method
        if data is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(data).encode()
            verb = verb or "POST"
        req = urllib.request.Request(
            self.origin + path, data=body, headers=headers, method=verb
        )
        with urllib.request.urlopen(req) as res:
            raw = res.read()
            if not raw:
                return None
            return json.loads(raw)

    def meta(self):
        return self._req("/api/v1/meta")

    def library(self):
        return self._req("/api/v1/library")

    def creations(self):
        return self._req("/api/v1/creations")

    def creation(self, id: str):
        return self._req(f"/api/v1/creations/{id}")

    def save(self, name: str, config: dict):
        return self._req("/api/v1/creations", {"name": name, "config": config})

    def delete_creation(self, id: str):
        return self._req(f"/api/v1/creations/{id}", method="DELETE")

    def history(self):
        return self._req("/api/v1/history")

    def teams(self):
        return self._req("/api/v1/teams")

    def usage(self):
        return self._req("/api/v1/usage")

    def deliveries(self):
        return self._req("/api/v1/webhooks/deliveries")

    def control(self, payload: dict):
        return self._req("/api/v1/control", payload)

    def poll_control(self):
        return self._req("/api/v1/control")
