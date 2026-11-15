import os
import tempfile
from pathlib import Path

# Isolated DB and no external services: tests exercise the deterministic fallback paths.
_tmp = Path(tempfile.mkdtemp()) / "test.db"
os.environ.update({
    "LOCAL_DATABASE_URL": f"sqlite:///{_tmp.as_posix()}",
    "GEMINI_API_KEY": "", "TYPESENSE_HOST": "", "TYPESENSE_ADMIN_API_KEY": "", "TIGER_DATABASE_URL": "",
    "CLINICIAN_ACCESS_CODE": "test-code", "SESSION_SIGNING_SECRET": "test-secret", "APP_ENV": "test",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def clinician(client):
    r = client.post("/api/auth/clinician", json={"name": "Dr Test", "access_code": "test-code"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture()
def patient_session(client, clinician):
    p = client.post("/api/patients", headers=clinician, json={
        "name": "Test Patient", "age": 50, "preferred_language": "en", "input_mode": "scan",
        "medications": ["Aspirin 81 mg daily"], "allergies": ["Penicillin"],
    }).json()
    s = client.post("/api/sessions", headers=clinician, json={"patient_id": p["id"]}).json()
    j = client.post("/api/auth/patient", json={"join_code": s["join_code"]}).json()
    return {"patient": p, "session": s, "patient_headers": {"Authorization": f"Bearer {j['token']}"},
            "patient_token": j["token"]}
