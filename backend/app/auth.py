from __future__ import annotations

from typing import Any

from fastapi import Header, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import get_settings


class AuthContext(dict):
    @property
    def uid(self) -> str:
        return str(self.get("uid") or "")


def require_auth(authorization: str = Header(default="")) -> AuthContext:
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="missing_bearer_token")

    settings = get_settings()
    request = google_requests.Request()
    try:
        payload: dict[str, Any] = id_token.verify_firebase_token(token, request)
    except Exception:
        try:
            payload = id_token.verify_oauth2_token(token, request)
        except Exception:
            try:
                payload = id_token.verify_token(token, request)
            except Exception:
                raise HTTPException(status_code=401, detail="invalid_token")

    audience = str(payload.get("aud") or "")
    allowed_audiences = {
        settings.gcp_project_id,
        "https://botbit-api-273106014373.us-central1.run.app",
        "https://botbit-api-qh5ljokdma-uc.a.run.app",
        "https://botbit-api-273106014373.southamerica-east1.run.app",
    }
    if audience and audience not in {item for item in allowed_audiences if item}:
        raise HTTPException(status_code=403, detail="token_project_mismatch")

    uid = str(payload.get("user_id") or payload.get("uid") or payload.get("sub") or "")
    if not uid:
        raise HTTPException(status_code=403, detail="missing_uid")

    return AuthContext(uid=uid, email=str(payload.get("email") or ""))
