"""Runtime configuration loaded from environment variables (never hard-coded secrets)."""
from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(ROOT / ".env"), str(ROOT / "backend" / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str = ""
    gemini_live_model: str = "gemini-3.8-live"
    gemini_text_model: str = "gemini-3.8-flash"
    gemini_embedding_model: str = "gemini-embedding-001"
    # Low-latency model for real-time question interpretation/translation; fallbacks tried in order.
    gemini_fast_model: str = "gemini-3.1-flash-lite"
    gemini_fallback_models: str = "gemini-3.5-flash,gemini-3.1-flash-lite"

    typesense_host: str = ""
    typesense_port: int = 443
    typesense_protocol: str = "https"
    typesense_admin_api_key: str = ""
    typesense_search_api_key: str = ""

    tiger_database_url: str = ""

    app_env: str = "development"
    frontend_origin: str = "http://localhost:5173"
    backend_port: int = 8000
    session_signing_secret: str = ""
    clinician_access_code: str = ""
    enable_demo: bool = True

    vultr_host: str = ""
    public_app_url: str = ""

    # Local fallback database used only when TIGER_DATABASE_URL is not configured.
    local_database_url: str = f"sqlite:///{(ROOT / 'backend' / 'local.db').as_posix()}"

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def signing_secret(self) -> str:
        if self.session_signing_secret:
            return self.session_signing_secret
        if self.is_production:
            raise RuntimeError("SESSION_SIGNING_SECRET must be set in production")
        return _ephemeral_secret()

    @property
    def effective_clinician_code(self) -> str:
        if self.clinician_access_code:
            return self.clinician_access_code
        if self.is_production:
            raise RuntimeError("CLINICIAN_ACCESS_CODE must be set in production")
        return "synaphi-dev"

    @property
    def cors_origins(self) -> list[str]:
        origins = {o.strip() for o in self.frontend_origin.split(",") if o.strip()}
        if self.public_app_url:
            origins.add(self.public_app_url.rstrip("/"))
        return sorted(origins)


@lru_cache
def _ephemeral_secret() -> str:
    return secrets.token_urlsafe(32)


@lru_cache
def get_settings() -> Settings:
    return Settings()
