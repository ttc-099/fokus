# split the master deck into per-slide html and render each to a 1920x1080 png
import re, subprocess, os, glob, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "deck.html")
OUT = HERE

html = open(SRC, encoding="utf-8").read()
style = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
body = html.split("<body>", 1)[1].rsplit("</body>", 1)[0]

# drop html comments first so they cannot become a phantom first slide
body = re.sub(r"<!--.*?-->", "", body, flags=re.S)

marks = [m.start() for m in re.finditer(r'<div class="slide', body)]
print("slide marks:", len(marks))
chunks = [body[marks[i]:(marks[i + 1] if i + 1 < len(marks) else len(body))]
          for i in range(len(marks))]
# keep only chunks that actually hold a slide div with content
chunks = [c for c in chunks if c.count("<div") and len(c) > 200]
print("slides:", len(chunks))

for f in glob.glob(f"{OUT}/slide-*.png"):
    os.remove(f)

rendered = []
for i, chunk in enumerate(chunks, start=1):
    page = (f'<!doctype html><html lang="en"><head><meta charset="utf-8">'
            f'<style>{style}</style></head><body>{chunk}</body></html>')
    path = f"{OUT}/slide-{i:02d}.html"
    open(path, "w", encoding="utf-8").write(page)

    png = f"{OUT}/slide-{i:02d}.png"
    cmd = ["timeout", "60", "/usr/bin/chromium", "--headless=new", "--no-sandbox",
           "--disable-gpu", "--force-device-scale-factor=1", "--window-size=1920,1080",
           "--hide-scrollbars", f"--user-data-dir=/tmp/deckp{i}", f"--screenshot={png}",
           f"file://{path}"]
    subprocess.run(cmd, capture_output=True)
    if not os.path.exists(png):
        print(f"slide {i}: FAILED")
        continue
    im = Image.open(png).convert("RGB")
    cols = len(im.resize((80, 45)).getcolors(99999) or [])
    print(f"slide {i}: {im.size} colors={cols}")
    rendered.append(png)

if rendered:
    imgs = [Image.open(p).convert("RGB") for p in rendered]
    imgs[0].save(f"{OUT}/fokus-pitch-deck.pdf", save_all=True,
                 append_images=imgs[1:], resolution=96)
    print("pdf pages:", len(imgs), os.path.getsize(f"{OUT}/fokus-pitch-deck.pdf") // 1024, "KB")
