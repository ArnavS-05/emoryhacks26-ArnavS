"""End-to-end acceptance test of the signature demo (requires backend :8000 and frontend :5173 running).

Run:  backend/.venv/Scripts/python tests/e2e/demo_flow.py [base_url]
Saves screenshots to tests/e2e/screenshots/.
"""
import sys
import time
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
OUT = Path(__file__).parent / "screenshots"
OUT.mkdir(exist_ok=True)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{BASE}/demo")

        doctor = page.get_by_label("Clinician care session")
        patient = page.get_by_label("Patient communication board")
        expect(patient.get_by_text("Waiting for your clinician")).to_be_visible(timeout=15000)
        expect(doctor.get_by_text("Patient connected")).to_be_visible(timeout=10000)
        page.screenshot(path=OUT / "01_demo_start.png")

        # Scene 3: clinician asks
        t0 = time.perf_counter()
        doctor.get_by_role("button", name="Where do you feel pain?").click()
        expect(patient.get_by_text("Where do you feel pain?")).to_be_visible(timeout=20000)
        print(f"question delivered to patient in {time.perf_counter() - t0:.2f}s")
        page.screenshot(path=OUT / "02_question_options.png")

        # Scene 6: patient selects (direct activation of on-screen cards)
        patient.get_by_role("button", name="Stomach").click()
        patient.get_by_role("button", name="upper right").click()
        expect(patient.get_by_text("How strong is the pain?")).to_be_visible()
        patient.get_by_role("button", name="6 Strong").click()
        patient.get_by_role("button", name="Sharp").click()
        expect(patient.get_by_text("I have pain in my stomach, upper right. My pain is 6 out of 10. It feels sharp.")).to_be_visible()
        page.screenshot(path=OUT / "03_review.png")

        # Scene 7: confirm and speak
        patient.get_by_role("button", name="Confirm and Speak").first.click()
        expect(doctor.get_by_text("Patient-confirmed response")).to_be_visible(timeout=10000)
        expect(doctor.get_by_text("I have pain in my stomach, upper right. My pain is 6 out of 10. It feels sharp.")).to_be_visible()
        page.screenshot(path=OUT / "04_confirmed.png")

        # Switch scanning with keyboard only: answer a yes/no question via Space presses.
        doctor.get_by_role("button", name="Are you having trouble breathing?").click()
        expect(patient.get_by_text("Are you having trouble breathing?")).to_be_visible(timeout=20000)
        page.locator("body").click(position={"x": 1500, "y": 500})  # focus non-input area of patient panel
        page.wait_for_timeout(300)
        page.keyboard.press("Space")  # select highlighted group (main options)
        page.keyboard.press("Space")  # select first item
        expect(patient.get_by_text("Is this what you want to say?")).to_be_visible(timeout=5000)
        page.screenshot(path=OUT / "05_scan_review.png")
        page.keyboard.press("Space")  # group: main (review cards)
        page.keyboard.press("Space")  # item: Confirm and Speak
        expect(doctor.locator("article").filter(has_text="Patient-confirmed response").nth(1)).to_be_visible(timeout=10000)

        # Help works independently
        patient.get_by_role("button", name="Help").first.click()
        expect(doctor.get_by_text("Patient requested help")).to_be_visible(timeout=10000)
        page.screenshot(path=OUT / "06_help.png")
        patient.get_by_role("button", name="Cancel alarm").click()

        # Scene 10: encounter draft
        doctor.get_by_role("tab", name="Encounter draft").click()
        doctor.get_by_role("button", name="Draft encounter note").click()
        expect(doctor.get_by_text("Patient-confirmed statements")).to_be_visible(timeout=40000)
        page.screenshot(path=OUT / "07_summary.png")

        assert not errors, f"page errors: {errors}"
        print("E2E demo flow: PASS")
        browser.close()


if __name__ == "__main__":
    main()
