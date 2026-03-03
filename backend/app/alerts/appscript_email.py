from __future__ import annotations

from typing import Any

import requests


class AppScriptEmailAlerter:
    def __init__(self, webhook_url: str = "", token: str = "", timeout_seconds: int = 20) -> None:
        self.webhook_url = webhook_url
        self.token = token
        self.timeout_seconds = timeout_seconds

    def is_enabled(self) -> bool:
        return bool(self.webhook_url and self.token)

    def send_email(
        self,
        to_email: str,
        subject: str,
        message: str,
        payload: dict[str, Any] | None = None,
    ) -> bool:
        if not self.is_enabled() or not to_email:
            return False

        body = {
            "token": self.token,
            "toEmail": to_email,
            "subject": subject,
            "message": message,
            "payload": payload or {},
        }
        response = requests.post(self.webhook_url, json=body, timeout=self.timeout_seconds)
        response.raise_for_status()
        return True
