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
        to_email: str | list[str],
        subject: str,
        message: str,
        payload: dict[str, Any] | None = None,
    ) -> tuple[bool, str]:
        """Send email via AppScript webhook.

        Returns (ok, error_detail). AppScript always returns HTTP 200 —
        we must check the JSON 'ok' field to know if it actually worked.
        """
        if not self.is_enabled():
            return False, "webhook_not_configured"

        # Support list of recipients
        if isinstance(to_email, list):
            recipients = ", ".join(e.strip() for e in to_email if e.strip())
        else:
            recipients = str(to_email or "").strip()

        if not recipients:
            return False, "no_recipients"

        body = {
            "token": self.token,
            "toEmail": recipients,
            "subject": subject,
            "message": message,
            "payload": payload or {},
        }
        try:
            response = requests.post(self.webhook_url, json=body, timeout=self.timeout_seconds)
            # AppScript web apps ALWAYS return HTTP 200 — check JSON ok field
            response.raise_for_status()
            try:
                json_resp = response.json()
                if not json_resp.get("ok", False):
                    error_detail = str(json_resp.get("error") or json_resp)
                    return False, f"appscript_error: {error_detail}"
                return True, ""
            except Exception:
                # If not JSON, assume success (shouldn't happen)
                return True, ""
        except requests.HTTPError as exc:
            return False, f"http_{exc.response.status_code if exc.response else 'error'}"
        except Exception as exc:
            return False, str(exc)[:200]
