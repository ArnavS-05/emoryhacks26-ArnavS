"""Generate FICTIONAL medical documents for testing extraction (no real patients, prescribers or pharmacies).

Run: backend/.venv/Scripts/python scripts/make_synthetic_documents.py   (requires `pip install pillow`)
Writes tests/fixtures/synthetic_prescription.png and synthetic_medication_list.pdf
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
OUT.mkdir(parents=True, exist_ok=True)


def font(size: int, bold: bool = False):
    for name in (["arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["arial.ttf", "DejaVuSans.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def page(lines: list[tuple[str, int, bool]], title: str) -> Image.Image:
    img = Image.new("RGB", (1240, 1754), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([40, 40, 1200, 1714], outline="#102a43", width=3)
    d.text((80, 70), title, fill="#102a43", font=font(44, True))
    d.text((80, 130), "SYNTHETIC DOCUMENT - FOR SOFTWARE TESTING ONLY - NOT A REAL PRESCRIPTION", fill="#b42318", font=font(22, True))
    y = 200
    for text, size, bold in lines:
        d.text((80, y), text, fill="#111111", font=font(size, bold))
        y += int(size * 1.7)
    return img


rx = page([
    ("Lakeside Family Clinic (fictional)  |  100 Example Ave, Springfield", 26, False),
    ("Prescriber: Dr. Jordan Example, MD   NPI: 0000000000 (placeholder)", 26, False),
    ("", 20, False),
    ("Patient: Elena Marsh      DOB: 03/14/1963      Date: 11/10/2026", 28, True),
    ("Allergies: PENICILLIN (hives), sulfa drugs (rash)", 28, True),
    ("", 20, False),
    ("Rx 1:  Atorvastatin 20 mg tablet", 30, True),
    ("        Sig: Take 1 tablet by mouth once daily at bedtime.  Qty: 30  Refills: 3", 26, False),
    ("Rx 2:  Apixaban 5 mg tablet", 30, True),
    ("        Sig: Take 1 tablet by mouth twice daily.  Qty: 60  Refills: 2", 26, False),
    ("Rx 3:  Acetaminophen 500 mg tablet", 30, True),
    ("        Sig: 1-2 tablets every 6 hours as needed for pain. Max 3 g/day.", 26, False),
    ("", 20, False),
    ("Diagnoses: Atrial fibrillation; hyperlipidemia; history of brainstem stroke (2025)", 26, False),
    ("Past surgery: Laparoscopic appendectomy (2011)", 26, False),
    ("", 20, False),
    ("Signature: J. Example (synthetic)", 26, False),
], "PRESCRIPTION")
rx.save(OUT / "synthetic_prescription.png")

med = page([
    ("Patient: Tomás Ibarra (fictional)     Reviewed: 11/12/2026", 28, True),
    ("", 20, False),
    ("Current medications:", 30, True),
    ("  - Metformin 500 mg PO twice daily with meals", 26, False),
    ("  - Lisinopril 10 mg PO once daily", 26, False),
    ("  - Insulin glargine 12 units subcut at bedtime", 26, False),
    ("", 20, False),
    ("Allergies:", 30, True),
    ("  - Latex (contact dermatitis)", 26, False),
    ("", 20, False),
    ("Conditions: Type 2 diabetes mellitus; hypertension", 26, False),
], "MEDICATION LIST")
med.save(OUT / "synthetic_medication_list.pdf", "PDF", resolution=150)
print("wrote", sorted(p.name for p in OUT.iterdir()))
