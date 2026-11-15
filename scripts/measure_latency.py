"""Measure real end-to-end latencies against a running Synaphi server (no simulated numbers).

Run: backend/.venv/Scripts/python scripts/measure_latency.py [base_url]
Writes docs/results/latency.json
"""
import asyncio
import json
import statistics
import sys
import time
from pathlib import Path

import httpx
import websockets

ROOT = Path(__file__).resolve().parents[1]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8001"
WS = BASE.replace("http", "ws", 1)
QUESTIONS = [
    "Where do you feel pain?", "How bad is the pain from zero to ten?", "Are you thirsty?",
    "Is it hard to breathe right now?", "Do you need the bathroom?", "What does the pain feel like?",
    "Have you taken your medicine today?", "Are you feeling scared?", "Do you want me to raise your bed?",
    "Is anything else bothering you?", "Does it hurt more when you move?", "Would you like your family here?",
]
SEARCHES = ["my tummy is sore", "cant catch my breath", "need to pee", "painkiller", "brething", "feel sick",
            "cold", "want my family", "itchy skin", "dizzy"]


def env_code() -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("CLINICIAN_ACCESS_CODE="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("CLINICIAN_ACCESS_CODE missing")


def pct(xs: list[float], p: float) -> float:
    xs = sorted(xs)
    return round(xs[min(len(xs) - 1, int(round(p * (len(xs) - 1))))], 1)


def summary(xs: list[float]) -> dict:
    return {"n": len(xs), "p50": pct(xs, 0.5), "p95": pct(xs, 0.95), "mean": round(statistics.mean(xs), 1), "max": round(max(xs), 1)}


async def main() -> None:
    c = httpx.AsyncClient(base_url=BASE, timeout=60)
    tok = (await c.post("/api/auth/clinician", json={"name": "Latency benchmark", "access_code": env_code()})).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    demo = (await c.post("/api/demo/start")).json()
    sid, ptok = demo["session"]["id"], demo["patient_token"]

    classify, ask_rt, ws_delivery, engines = [], [], [], {}
    async with websockets.connect(f"{WS}/ws/sessions/{sid}?token={ptok}") as ws:
        await ws.recv()  # presence
        for q in QUESTIONS:
            t0 = time.perf_counter()
            r = (await c.post(f"/api/sessions/{sid}/questions", headers=h, json={"text": q})).json()
            t_http = (time.perf_counter() - t0) * 1000
            while True:
                evt = json.loads(await ws.recv())
                if evt["type"] == "question":
                    break
            t_ws = (time.perf_counter() - t0) * 1000
            classify.append(r["intent"]["classify_ms"])
            ask_rt.append(t_http)
            ws_delivery.append(t_ws)
            engines[r["ai_engine"]] = engines.get(r["ai_engine"], 0) + 1

        # Patient confirmation -> clinician socket
        confirm_ws = []
        async with websockets.connect(f"{WS}/ws/sessions/{sid}?token={tok}") as doc_ws:
            await doc_ws.recv()
            for i in range(10):
                t0 = time.perf_counter()
                await c.post(f"/api/sessions/{sid}/messages", headers={"Authorization": f"Bearer {ptok}"}, json={
                    "patient_text": "Yes.", "patient_language": "en", "clinician_text": "Yes.", "input_mode": "benchmark"})
                while True:
                    evt = json.loads(await doc_ws.recv())
                    if evt["type"] == "message_confirmed":
                        break
                confirm_ws.append((time.perf_counter() - t0) * 1000)

    ts_time, ts_rt, search_engine = [], [], set()
    for q in SEARCHES:
        r = (await c.post("/api/search/phrases", headers=h, json={"q": q, "mode": "hybrid", "limit": 8})).json()
        search_engine.add(f"{r['engine']}:{r['mode']}")
        if r["search_time_ms"] is not None:
            ts_time.append(r["search_time_ms"])
        ts_rt.append(r["round_trip_ms"])

    out = {
        "measured_at": time.strftime("%Y-%m-%d %H:%M %Z"),
        "server": BASE,
        "question_interpretation_ms (Gemini, server-side)": summary(classify),
        "question_http_roundtrip_ms (interpret+retrieve+translate+persist)": summary(ask_rt),
        "question_to_patient_device_ms (WebSocket delivery)": summary(ws_delivery),
        "patient_confirm_to_clinician_ms (WebSocket delivery)": summary(confirm_ws),
        "typesense_search_time_ms (server-reported)": summary(ts_time) if ts_time else None,
        "phrase_search_roundtrip_ms (backend->Typesense Cloud->backend)": summary(ts_rt),
        "interpretation_engines": engines,
        "search_engines": sorted(search_engine),
    }
    (ROOT / "docs" / "results").mkdir(parents=True, exist_ok=True)
    (ROOT / "docs" / "results" / "latency.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))
    # Clean up: end the benchmark demo session
    await c.post(f"/api/sessions/{sid}/end", headers=h)


asyncio.run(main())
