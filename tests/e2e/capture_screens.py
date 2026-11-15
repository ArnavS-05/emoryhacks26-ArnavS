"""Capture documentation screenshots of the clinician-side screens (real running app, synthetic data)."""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8001"
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)
code = next(l.split("=", 1)[1].strip() for l in (ROOT / ".env").read_text(encoding="utf-8").splitlines() if l.startswith("CLINICIAN_ACCESS_CODE="))

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 960})
    pg.goto(f"{BASE}/login")
    pg.get_by_label("Your name").fill("Dr. Rivera")
    pg.get_by_label("Access code").fill(code)
    pg.screenshot(path=OUT / "login.png")
    pg.get_by_role("button", name="Sign in").click()
    pg.get_by_role("heading", name="Dashboard").wait_for()
    pg.wait_for_timeout(800)
    pg.screenshot(path=OUT / "dashboard.png")

    pg.get_by_role("link", name="Elena Marsh", exact=True).click()
    pg.get_by_text("Pending review").wait_for()
    pg.wait_for_timeout(800)
    pg.screenshot(path=OUT / "patient_record.png", full_page=True)
    pg.get_by_text("Pending review").scroll_into_view_if_needed()
    pg.screenshot(path=OUT / "document_review.png")

    pg.goto(f"{BASE}/clinician/search")
    pg.get_by_role("button", name="Compare").click()
    pg.get_by_text("Hybrid (keyword + vector)").wait_for(timeout=15000)
    pg.wait_for_timeout(500)
    pg.screenshot(path=OUT / "search_inspector.png", full_page=True)

    pg.goto(f"{BASE}/clinician/analytics")
    pg.get_by_text("Communication analytics").wait_for(timeout=15000)
    pg.wait_for_timeout(1200)
    pg.screenshot(path=OUT / "analytics.png", full_page=True)

    pg.goto(f"{BASE}/inspect")
    pg.get_by_text("Google Gemini").wait_for(timeout=15000)
    pg.wait_for_timeout(800)
    pg.screenshot(path=OUT / "tech_inspection.png", full_page=True)

    pg.goto(f"{BASE}/clinician/patients/new")
    pg.wait_for_timeout(500)
    pg.screenshot(path=OUT / "new_patient.png")
    b.close()
print("saved:", sorted(x.name for x in OUT.iterdir()))
