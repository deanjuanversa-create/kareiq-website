#!/usr/bin/env python3
"""Test documents for tools/check-docs.js (real files, read by the real pipeline; nothing is mocked).

  python3 tools/fixtures/make_docs.py <out-dir> <json: {"d1": "2026-11-12", ...}>

Writes PDFs with a text layer (reportlab), scanned-looking PNG images (Pillow; read by OpenCV +
Tesseract OCR), a degraded photo and a broken PDF. The values are ordinary test values chosen for
the checks; the dates are passed in so they are always in the recent past.
"""
import json, os, random, sys
from datetime import date
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw, ImageFilter, ImageFont

out, dates = sys.argv[1], json.loads(sys.argv[2])
os.makedirs(out, exist_ok=True)
D = {k: date.fromisoformat(v) for k, v in dates.items()}
mon = lambda d: d.strftime("%d-%b-%Y")      # 12-Nov-2026
dmy = lambda d: d.strftime("%d/%m/%Y")      # 12/11/2026

def pdf(name, lines):
    c = canvas.Canvas(os.path.join(out, name), pagesize=A4)
    y = 800
    for ln in lines:
        if ln.startswith("#"):
            c.setFont("Helvetica-Bold", 12); ln = ln[1:]
        else:
            c.setFont("Helvetica", 10)
        c.drawString(50, y, ln); y -= 18
    c.showPage(); c.save()

def png(name, lines, size=34, degrade=False):
    font = None
    for f in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"]:
        if os.path.exists(f):
            font = ImageFont.truetype(f, size); break
    font = font or ImageFont.load_default()
    img = Image.new("L", (1700, 120 + len(lines) * int(size * 1.8)), 255)
    d = ImageDraw.Draw(img)
    y = 60
    for ln in lines:
        d.text((80, y), ln, fill=0, font=font); y += int(size * 1.8)
    if degrade:
        random.seed(7)
        img = img.rotate(2.5, expand=True, fillcolor=255).filter(ImageFilter.GaussianBlur(1.6))
        px = img.load()
        for _ in range(40000):
            x, yy = random.randrange(img.width), random.randrange(img.height)
            px[x, yy] = random.choice([0, 255, 128])
        img = img.resize((img.width // 2, img.height // 2))
    img.save(os.path.join(out, name))

# A. laboratory report with a text layer: collection date and report date differ
pdf("lab_text.pdf", ["#CITY DIAGNOSTICS LABORATORY", "Patient Name: Test Patient    Age: 70 Yrs    Sex: Female",
    "Sample Collected On: " + mon(D["d1"]), "Report Date: " + mon(D["d1r"]), "",
    "#LIPID PROFILE", "Test Name              Result     Unit        Biological Ref. Interval",
    "HDL Cholesterol        48         mg/dL       40 - 60", "Total Cholesterol      190        mg/dL       < 200",
    "#LIVER FUNCTION TEST", "SGOT (AST)             32         U/L         5 - 40", "SGPT (ALT)             28         U/L         7 - 56",
    "Serum Albumin          4.2        g/dL        3.5 - 5.2",
    "#COMPLETE BLOOD COUNT", "Platelet Count         2.5        lakhs/cumm  1.5 - 4.5",
    "#DIABETES PROFILE", "HbA1c                  6.1        %           4.0 - 5.6", "Fasting Blood Sugar    104        mg/dL       70 - 100",
    "#BIOCHEMISTRY", "hs-CRP                 1.8        mg/L        < 3.0", "eGFR                   72         mL/min/1.73m2  > 60",
    "Urine Albumin Creatinine Ratio   25   mg/g     < 30"])
# B. a scanned vitals record (image only: read by OCR)
png("vitals_scan.png", ["VITAL SIGNS RECORD", "Visit Date: " + dmy(D["d2"]), "Blood Pressure: 134/86 mmHg", "Pulse Rate: 78 bpm",
    "SpO2: 97 %", "Temperature: 98.6 F", "Weight: 61.5 kg"])
# C. values but no date at all
pdf("no_date.pdf", ["#LAB REPORT", "Test Name   Result   Unit", "HDL Cholesterol   50   mg/dL   40 - 60"])
# D. only a report date (the test date is not shown)
pdf("report_only.pdf", ["#LAB REPORT", "Report Date: " + mon(D["d3"]), "Total Cholesterol   201   mg/dL   < 200"])
# E. two different collection dates
pdf("two_dates.pdf", ["#LAB REPORT", "Sample Collected On: " + mon(D["d4"]), "Collection Date: " + mon(D["d5"]), "HDL Cholesterol   55   mg/dL   40 - 60"])
# F. values that must not be stored automatically
pdf("invalid.pdf", ["#LAB REPORT", "Sample Collected On: " + mon(D["d6"]), "HDL Cholesterol   900   mg/dL   40 - 60", "Platelet Count   2.1",
    "CRP   3.1   mg/L   < 5", "Blood Sugar   110   mg/dL", "HbA1c   48   mmol/mol", "eGFR   < 15   mL/min/1.73m2"])
# G. a different document repeating a measurement already stored (same test, date and value as A)
pdf("repeat_value.pdf", ["#LIPID PROFILE (COPY FOR FAMILY DOCTOR)", "Sample Collected On: " + mon(D["d1"]), "HDL Cholesterol   48   mg/dL   40 - 60"])
# H. a questionnaire result (risk engine input) and a vital, for a customer upload
pdf("assessment.pdf", ["#MENTAL HEALTH SCREENING", "Test Date: " + mon(D["d7"]), "PHQ-9 Total Score: 12", "GAD-7 Total Score: 4", "Blood Pressure: 118/76 mmHg"])
# I. a poor photo
png("degraded.png", ["Sample Collected On: " + dmy(D["d8"]), "HDL Cholesterol  52  mg/dL", "Total Cholesterol  188  mg/dL"], size=22, degrade=True)
# K. an old report (before the customer registered), with a two-digit year
pdf("old_report.pdf", ["#CITY DIAGNOSTICS LABORATORY", "Sample Collected: " + D["d9"].strftime("%d-%b-%y"), "Fasting Blood Sugar   98   mg/dL   70 - 100",
    "Pittsburgh Sleep Quality Index (PSQI) Global Score: 4"])
# J. a PDF that cannot be read
with open(os.path.join(out, "broken.pdf"), "wb") as f:
    f.write(b"%PDF-1.4\n%this is not a real PDF body\n" + bytes(range(256)) * 4)
print(json.dumps(sorted(os.listdir(out))))
