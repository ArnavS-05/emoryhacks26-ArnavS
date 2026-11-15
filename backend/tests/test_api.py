import asyncio

import pytest
from starlette.websockets import WebSocketDisconnect

from app.schemas import QuestionInterpretation
from app.services import fallback, typesense_service
from app.services.phrases import PHRASES


def test_health(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and r["database_ok"]


def test_phrase_library_size_and_shape():
    assert 100 <= len(PHRASES) <= 200
    ids = [p["id"] for p in PHRASES]
    assert len(ids) == len(set(ids))
    assert {"pain", "breathing", "urgent", "medication", "hygiene"} <= {p["category"] for p in PHRASES}


# 1. Patient creation and profile retrieval
def test_patient_create_and_get(client, clinician, patient_session):
    pid = patient_session["patient"]["id"]
    d = client.get(f"/api/patients/{pid}", headers=clinician).json()
    assert d["name"] == "Test Patient"
    kinds = {(c["kind"], c["status"]) for c in d["context"]}
    assert ("medication", "verified") in kinds and ("allergy", "verified") in kinds
    assert d["accessibility"]["input_mode"] == "scan"


# 15. Unauthorized-access prevention
def test_auth_required_and_roles(client, clinician, patient_session):
    assert client.get("/api/patients").status_code == 401
    assert client.get("/api/patients", headers={"Authorization": "Bearer forged"}).status_code == 401
    ph = patient_session["patient_headers"]
    assert client.get("/api/patients", headers=ph).status_code == 403
    pid = patient_session["patient"]["id"]
    assert client.get(f"/api/patients/{pid}", headers=ph).status_code == 403
    other = client.post("/api/sessions", headers=clinician, json={"patient_id": pid}).json()
    assert client.get(f"/api/sessions/{other['id']}", headers=ph).status_code == 403
    assert client.post("/api/auth/clinician", json={"name": "x", "access_code": "wrong"}).status_code == 401


def test_patient_view_has_no_medical_record(client, patient_session):
    sid = patient_session["session"]["id"]
    st = client.get(f"/api/sessions/{sid}", headers=patient_session["patient_headers"]).json()
    assert "context" not in st["patient"] and "note" not in st


# 4. Question classification — fallback output is schema-valid and labelled
def test_fallback_classifier_schema():
    for q in ["Where do you feel pain?", "How bad is the pain from 0 to 10?", "Are you comfortable?",
              "Do you have a fever?", "Is it hard to breathe?", "asdf qwer"]:
        interp, engine = fallback.classify(q)
        assert isinstance(interp, QuestionInterpretation) and engine == "fallback:rules"
    assert fallback.classify("Where does it hurt?")[0].response_type.value == "body_location"
    assert fallback.classify("How bad is the pain from 0 to 10?")[0].response_type.value == "scale"


# 3. Retrieval and ranking (local fallback mirrors Typesense filtering)
def test_local_search_context_ranking():
    r = asyncio.run(typesense_service.search_phrases(
        "pain location body area", intent="pain_location", categories=["pain"], response_types=["location"], limit=12))
    assert {"head", "chest", "stomach", "back", "arms", "legs"} <= {d["anatomical_region"] for d in r["results"]}
    assert r["engine"] == "fallback:local"
    r2 = asyncio.run(typesense_service.search_phrases("brething", intent="breathing", categories=["breathing"], limit=5))
    assert r2["results"][0]["category"] == "breathing"


# 5 + 6 + 12. WebSocket sync, patient-only confirmation, event persistence
def test_question_ws_sync_and_confirm(client, clinician, patient_session):
    sid = patient_session["session"]["id"]
    with client.websocket_connect(f"/ws/sessions/{sid}?token={patient_session['patient_token']}") as ws:
        assert ws.receive_json()["type"] == "presence"
        turn = client.post(f"/api/sessions/{sid}/questions", headers=clinician, json={"text": "Where do you feel pain?"}).json()
        evt = ws.receive_json()
        assert evt["type"] == "question" and evt["payload"]["id"] == turn["id"]
        assert turn["intent"]["response_type"] == "body_location"
        assert any(o["anatomical_region"] == "stomach" for o in turn["options"])

        body = {"turn_id": turn["id"], "patient_text": "I have pain in my stomach.", "patient_language": "en",
                "clinician_text": "I have pain in my stomach.", "input_mode": "scan", "composition_ms": 8000,
                "selections": [{"step": "location", "phrase_id": "pain-stomach", "label": "Stomach", "clinician_label": "Stomach"}]}
        assert client.post(f"/api/sessions/{sid}/messages", headers=clinician, json=body).status_code == 403
        m = client.post(f"/api/sessions/{sid}/messages", headers=patient_session["patient_headers"], json=body)
        assert m.status_code == 201
        evt = ws.receive_json()
        assert evt["type"] == "message_confirmed" and evt["payload"]["clinician_text"] == "I have pain in my stomach."

    ev = client.post(f"/api/sessions/{sid}/events", headers=patient_session["patient_headers"], json={"events": [
        {"input_mode": "scan", "event_type": "selection", "response_latency_ms": 2100, "selection_success": True},
        {"input_mode": "scan", "event_type": "correction"},
    ]})
    assert ev.status_code == 201
    a = client.get(f"/api/patients/{patient_session['patient']['id']}/analytics", headers=clinician).json()
    assert a["metrics"]["selections"] >= 1 and a["metrics"]["confirmed_messages"] == 1


def test_ws_rejects_bad_token(client, patient_session):
    sid = patient_session["session"]["id"]
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/sessions/{sid}?token=bad") as ws:
            ws.receive_json()


# 14. Service-failure fallback: help works with no AI services configured
def test_help_independent_of_ai(client, patient_session):
    sid = patient_session["session"]["id"]
    r = client.post(f"/api/sessions/{sid}/help", headers=patient_session["patient_headers"], json={"input_mode": "blink"})
    assert r.status_code == 201 and r.json()["is_urgent"]


# 13. Summary + copilot fallback; approval flow
def test_summary_and_copilot(client, clinician, patient_session):
    sid = patient_session["session"]["id"]
    client.post(f"/api/sessions/{sid}/messages", headers=patient_session["patient_headers"], json={
        "patient_text": "I have pain in my chest.", "patient_language": "en", "clinician_text": "I have pain in my chest.",
        "input_mode": "touch"})
    cp = client.post(f"/api/sessions/{sid}/copilot", headers=clinician).json()
    assert cp["engine"].startswith("fallback")
    assert "I have pain in my chest." in cp["insights"]["patient_confirmed_concerns"]
    assert any("intensity" in x.lower() for x in cp["insights"]["missing_information"])
    note = client.post(f"/api/sessions/{sid}/summary", headers=clinician).json()
    assert note["status"] == "draft"
    content = {**note["content"], "reason_for_visit": "Chest pain follow-up"}
    ok = client.put(f"/api/sessions/{sid}/summary/{note['id']}", headers=clinician, json={"content": content, "approve": True}).json()
    assert ok["status"] == "approved" and ok["approved_by"] == "Dr Test"


# 2. Document upload validation + review lifecycle
def test_document_upload_and_review(client, clinician, patient_session):
    pid = patient_session["patient"]["id"]
    bad = client.post(f"/api/patients/{pid}/documents", headers=clinician, files={"file": ("x.png", b"not a png", "image/png")})
    assert bad.status_code == 415
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
    r = client.post(f"/api/patients/{pid}/documents", headers=clinician, files={"file": ("rx.png", png, "image/png")}).json()
    assert r["document"]["extraction_status"] == "failed" and r["fields"] == []
    c = client.post(f"/api/patients/{pid}/context", headers=clinician, json={"kind": "medication", "label": "Metformin"}).json()
    rv = client.patch(f"/api/patients/{pid}/context/{c['id']}", headers=clinician, json={"status": "rejected"}).json()
    assert rv["status"] == "rejected"


# Adaptive engine: recommends from real events, never applies without confirmation
def test_adaptive_recommendation_requires_confirmation(client, clinician, patient_session):
    pid, sid = patient_session["patient"]["id"], patient_session["session"]["id"]
    ph = patient_session["patient_headers"]
    events = [{"input_mode": "scan", "event_type": "scan_cycle_missed", "scan_interval_ms": 1500}] * 5 + \
             [{"input_mode": "scan", "event_type": "selection", "selection_success": True, "response_latency_ms": 4000}] * 3
    client.post(f"/api/sessions/{sid}/events", headers=ph, json={"events": events})
    a = client.get(f"/api/patients/{pid}/analytics", headers=ph).json()
    rec = next(r for r in a["recommendations"] if r["setting"] == "scan_interval_ms")
    assert rec["suggested"] > rec["current"]
    before = client.get(f"/api/patients/{pid}", headers=clinician).json()["accessibility"]["scan_interval_ms"]
    assert before == rec["current"]
    assert client.post(f"/api/patients/{pid}/recommendations/apply", headers=ph,
                       json={"setting": "scan_interval_ms", "value": rec["suggested"]}).status_code == 400
    ok = client.post(f"/api/patients/{pid}/recommendations/apply", headers=ph,
                     json={"setting": "scan_interval_ms", "value": rec["suggested"], "confirmed": True}).json()
    assert ok["value"] == rec["suggested"] and ok["calibration_version"] == 2


def test_demo_start(client):
    d = client.post("/api/demo/start").json()
    assert d["session"]["is_demo"] and d["patient"]["name"] == "Elena Marsh"
    assert "context" not in d["patient"]
