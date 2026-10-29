#!/usr/bin/env python3
"""Read the text of an uploaded medical report (PDF or photo) so the app can find its date.

  python3 ocr/report_reader.py <file> <mime> [deep]   ->   JSON on stdout:
  {"ok": true, "pages": [{"page": 1, "source": "text" | "ocr", "text": "..."}], "engine": {...}}

Pipeline
  1. PDF with a real text layer: the text is taken as it is (pdftotext), page by page.
  2. Scanned PDF pages and photos: the page is rendered (pdftoppm, 300 dpi) or decoded, then
     OpenCV prepares it for reading: grayscale, resize to a readable size, denoise, straighten
     (deskew), even out lighting and binarise (adaptive threshold, with Otsu as a second try).
  3. Tesseract (LSTM engine) reads the prepared page. OpenCV only prepares the image; Tesseract
     does the text recognition.
  4. "deep" (a second pass when the first found no date): scanned pages are rendered at 400 dpi and
     read with two more page layouts (single block and sparse text) on both prepared images.
Nothing is written anywhere except a private temporary folder that is removed at the end, and the
text is never logged.
"""
import json, os, re, shutil, subprocess, sys, tempfile

MAX_PAGES = 6
TIMEOUT = 90  # seconds for each external step (slow servers need more)

def run(cmd, timeout=TIMEOUT):
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False)

def meaningful(text):
    return len(re.findall(r"[A-Za-z0-9]", text or ""))

def versions():
    out = {}
    try:
        import cv2
        out["opencv"] = cv2.__version__
    except Exception:
        out["opencv"] = None
    try:
        v = run(["tesseract", "--version"], 10)
        out["tesseract"] = (v.stdout or v.stderr).decode("utf-8", "replace").split("\n")[0].strip()
    except Exception:
        out["tesseract"] = None
    out["poppler"] = bool(shutil.which("pdftotext") and shutil.which("pdftoppm"))
    return out

def prepare(cv2, np, img):
    """OpenCV preprocessing for one page; returns a list of candidate images to read (best first)."""
    if img is None:
        return []
    if img.ndim == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = img.shape[:2]
    # text reads best at roughly 2000-2600 px across: enlarge small photos, shrink huge scans
    target = 2400.0
    scale = target / float(max(w, 1))
    if scale > 1.15 or scale < 0.8:
        scale = max(0.35, min(scale, 3.0))
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA)
    img = cv2.fastNlMeansDenoising(img, None, h=10, templateWindowSize=7, searchWindowSize=21)
    # straighten slightly rotated pages (up to 15 degrees) using the angle of the text pixels
    try:
        inv = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
        pts = cv2.findNonZero(inv)
        if pts is not None and len(pts) > 500:
            angle = cv2.minAreaRect(pts)[-1]
            if angle > 45:
                angle -= 90
            if 0.3 < abs(angle) <= 15:
                hh, ww = img.shape[:2]
                m = cv2.getRotationMatrix2D((ww / 2, hh / 2), angle, 1.0)
                img = cv2.warpAffine(img, m, (ww, hh), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    except Exception:
        pass
    # even out uneven lighting (phone photos), then binarise
    bg = cv2.morphologyEx(img, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    norm = cv2.divide(img, bg, scale=255)
    adaptive = cv2.adaptiveThreshold(norm, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 12)
    otsu = cv2.threshold(norm, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    return [adaptive, otsu]

def tesseract(path, psm="3"):
    r = run(["tesseract", path, "stdout", "-l", "eng", "--oem", "1", "--psm", psm, "-c", "preserve_interword_spaces=1"])
    return r.stdout.decode("utf-8", "replace") if r.returncode == 0 else ""

def ocr_image(cv2, np, img, work, tag, deep=False):
    if deep and img is not None:
        texts = []
        for i, prepared in enumerate(prepare(cv2, np, img)):
            p = os.path.join(work, "%s-d%d.png" % (tag, i))
            cv2.imwrite(p, prepared)
            for psm in ("6", "11"):
                texts.append(tesseract(p, psm))
        return "\n".join(texts)
    best = ""
    for i, prepared in enumerate(prepare(cv2, np, img)):
        p = os.path.join(work, "%s-%d.png" % (tag, i))
        cv2.imwrite(p, prepared)
        text = tesseract(p)
        if meaningful(text) > meaningful(best):
            best = text
        if meaningful(best) > 120:
            break
    # a page photographed sideways: let Tesseract find the orientation and read again
    if meaningful(best) < 40 and img is not None:
        for k in (cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_90_COUNTERCLOCKWISE, cv2.ROTATE_180):
            rotated = cv2.rotate(img, k)
            for i, prepared in enumerate(prepare(cv2, np, rotated)[:1]):
                p = os.path.join(work, "%s-r%d.png" % (tag, k))
                cv2.imwrite(p, prepared)
                text = tesseract(p)
                if meaningful(text) > meaningful(best):
                    best = text
            if meaningful(best) >= 80:
                break
    return best

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "usage"})); return
    src, mime = sys.argv[1], sys.argv[2]
    deep = len(sys.argv) > 3 and sys.argv[3] == "deep"
    try:
        import cv2, numpy as np
    except Exception:
        print(json.dumps({"ok": False, "error": "opencv-missing", "engine": versions()})); return
    if not shutil.which("tesseract"):
        print(json.dumps({"ok": False, "error": "tesseract-missing", "engine": versions()})); return
    work = tempfile.mkdtemp(prefix="kq-ocr-")
    os.chmod(work, 0o700)
    pages = []
    try:
        if mime == "application/pdf":
            if not shutil.which("pdftotext"):
                print(json.dumps({"ok": False, "error": "poppler-missing", "engine": versions()})); return
            info = run(["pdfinfo", src], 15).stdout.decode("utf-8", "replace") if shutil.which("pdfinfo") else ""
            m = re.search(r"Pages:\s+(\d+)", info)
            count = min(int(m.group(1)) if m else MAX_PAGES, MAX_PAGES)
            for n in range(1, count + 1):
                t = run(["pdftotext", "-layout", "-f", str(n), "-l", str(n), src, "-"]).stdout.decode("utf-8", "replace")
                if meaningful(t) >= 60 and not deep:
                    pages.append({"page": n, "source": "text", "text": t})
                    continue
                prefix = os.path.join(work, "p%d" % n)
                run(["pdftoppm", "-r", "400" if deep else "300", "-f", str(n), "-l", str(n), "-png", src, prefix], 90)
                imgs = sorted(f for f in os.listdir(work) if f.startswith("p%d" % n) and f.endswith(".png"))
                img = cv2.imread(os.path.join(work, imgs[0])) if imgs else None
                pages.append({"page": n, "source": "ocr", "text": ocr_image(cv2, np, img, work, "o%d" % n, deep)})
        else:
            img = cv2.imread(src, cv2.IMREAD_COLOR)
            if img is None:
                print(json.dumps({"ok": False, "error": "unreadable-image", "engine": versions()})); return
            if deep:
                img = cv2.resize(img, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
            pages.append({"page": 1, "source": "ocr", "text": ocr_image(cv2, np, img, work, "o1", deep)})
        print(json.dumps({"ok": True, "pages": pages, "engine": versions()}))
    except subprocess.TimeoutExpired:
        print(json.dumps({"ok": False, "error": "timeout", "pages": pages, "engine": versions()}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": "failed: " + type(e).__name__, "engine": versions()}))
    finally:
        shutil.rmtree(work, ignore_errors=True)

if __name__ == "__main__":
    main()
