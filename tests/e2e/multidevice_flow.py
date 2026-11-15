"""E2E: two separate devices (browser contexts), one-time pairing link, Spanish patient / English clinician,
dwell selection. Requires backend :8000 + frontend :5173 and CLINICIAN_ACCESS_CODE in .env.

Run: backend/.venv/Scripts/python tests/e2e/multidevice_flow.py
"""
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
OUT = Path(__file__).parent / "screenshots"
ROOT = Path(__file__).resolve().parents[2]


def access_code() -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("CLINICIAN_ACCESS_CODE="):
            return line.split("=", 1)[1].strip()
    return os.environ.get("CLINICIAN_ACCESS_CODE", "synaphi-dev")


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        doc_ctx = browser.new_context(viewport={"width": 1400, "height": 950})
        pat_ctx = browser.new_context(viewport={"width": 1180, "height": 820})  # tablet-sized patient device
        doc, pat = doc_ctx.new_page(), pat_ctx.new_page()
        errors: list[str] = []
        for pg in (doc, pat):
            pg.on("pageerror", lambda e: errors.append(str(e)))

        # Clinician signs in and starts a session for the Spanish-speaking patient
        doc.goto(f"{BASE}/login")
        doc.get_by_label("Your name").fill("Dr. Test")
        doc.get_by_label("Access code").fill(access_code())
        doc.get_by_role("button", name="Sign in").click()
        expect(doc.get_by_role("heading", name="Dashboard")).to_be_visible()
        doc.locator("li", has_text="Tomás Ibarra").get_by_role("button", name="Start care session").click()
        expect(doc.get_by_text("Patient not connected")).to_be_visible(timeout=10000)

        # One-time pairing link → patient device
        doc.get_by_role("button", name="Pair device").click()
        expect(doc.get_by_alt_text("QR code for the one-time pairing link")).to_be_visible()
        doc.screenshot(path=OUT / "10_pair_qr.png")
        r = doc.request.post(f"{BASE}/api/sessions/{doc.url.rsplit('/', 1)[1]}/pair",
                             headers={"Authorization": "Bearer " + doc.evaluate("JSON.parse(sessionStorage.getItem('synaphi-auth')).state.clinician.token")})
        path = r.json()["path"]
        doc.get_by_role("button", name="Done").click()
        pat.goto(f"{BASE}{path}")
        expect(pat.get_by_text("Esperando a su médico")).to_be_visible(timeout=15000)
        assert "#" not in pat.url, "pairing token must be stripped from the URL"
        expect(doc.get_by_text("Patient connected")).to_be_visible(timeout=10000)
        # Link is single-use
        assert pat.request.post(f"{BASE}/api/auth/pair", data={"token": path.split("#")[1]}).status == 401

        # English question → Spanish on patient device (live Gemini translation)
        doc.get_by_label("Question for the patient").fill("Are you thirsty or hungry?")
        doc.get_by_role("button", name="Ask").click()
        expect(pat.get_by_text("Su médico pregunta")).to_be_visible(timeout=20000)
        q = pat.locator("header p.font-bold").first.inner_text()
        print("patient sees question:", q)
        pat.screenshot(path=OUT / "11_spanish_patient.png")

        # Patient answers by touch in Spanish; clinician receives English
        pat.get_by_role("button", name="Sí").click()
        expect(pat.get_by_text("¿Es esto lo que quiere decir?")).to_be_visible()
        pat.get_by_role("button", name="Confirmar y hablar").first.click()
        expect(doc.get_by_text("Patient-confirmed response")).to_be_visible(timeout=10000)
        expect(doc.get_by_text("Patient’s words: Sí.")).to_be_visible()
        doc.screenshot(path=OUT / "12_clinician_receives_english.png")

        # Dwell selection on the patient device: switch mode, hover a card, no click
        pat.get_by_role("button", name="Accessibility settings").click()
        pat.get_by_role("radio", name=re.compile("Dwell")).check()
        pat.get_by_role("button", name="Close settings").click()
        expect(pat.get_by_text(re.compile("Dwell selection"))).to_be_visible()
        box = pat.get_by_role("button", name="Sed").bounding_box()
        pat.mouse.move(box["x"] + 20, box["y"] + 20)
        pat.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=5)
        expect(pat.get_by_text("¿Es esto lo que quiere decir?")).to_be_visible(timeout=4000)
        expect(pat.get_by_text("Tengo sed.").first).to_be_visible()
        pat.screenshot(path=OUT / "13_dwell_review.png")
        # Pointer resting in place must NOT chain-select the next card
        pat.wait_for_timeout(2500)
        expect(pat.get_by_text("¿Es esto lo que quiere decir?")).to_be_visible()

        assert not errors, f"page errors: {errors}"
        print("E2E multi-device flow: PASS")
        browser.close()


if __name__ == "__main__":
    main()
