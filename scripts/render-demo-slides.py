"""Render 1920x1080 CorpShift video cards from reviewed UI captures."""

from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "demo-video-render"
OUT.mkdir(parents=True, exist_ok=True)

SCENES = [
    ("CORPSHIFT / THE PROBLEM", "A stock split should never liquidate a healthy borrower.", "When raw token balances meet a price per economic share, a 4:1 split can make collateral look four times smaller.", "hero", 16),
    ("01 / CONTROLLED LAB", "Same user. Same position. Two vaults.", "$1,000 collateral  ·  $400 debt  ·  health factor 2.00", "lab-1", 15),
    ("02 / ATTEST", "The corporate action lands onchain.", "An EIP-712 attestation moves the asset into ACTION_PENDING.", "lab-2", 13),
    ("03 / POLICY GATE", "New borrowing pauses before the split.", "The naive vault allows it. CorpShiftAwareVault blocks it.", "lab-3", 13),
    ("04 / EXECUTE", "4× the shares. One quarter of the price.", "The multiplier moves to 4× as the price moves from $100 to $25 per economic share.", "lab-4", 14),
    ("05 / THE DIVERGENCE", "$250 seen. $1,000 real.", "The naive vault loses the economic meaning of the position.", "lab-5", 13),
    ("06 / THE OUTCOME", "Wrongful liquidation, prevented.", "NaiveVault liquidates. CorpShiftAwareVault retains the healthy position at HF 2.00.", "lab-6", 18),
    ("07 / VERIFIABLE", "The result is backed by receipts.", "Accepted writes have transaction hashes. Rejected operations are checked against expected contract errors.", "evidence", 13),
    ("CORPSHIFT", "The stock changes. DeFi stays correct.", "Corporate-action infrastructure for onchain finance.", "end", 12),
]

FONT_DIR = Path("C:/Windows/Fonts")
def font(name, size):
    return ImageFont.truetype(str(FONT_DIR / name), size)

REG = lambda n: font("segoeui.ttf", n)
BOLD = lambda n: font("segoeuib.ttf", n)
MONO = lambda n: font("consola.ttf", n)

def wrap(draw, text, face, width):
    lines, line = [], ""
    for word in text.split():
        proposed = f"{line} {word}".strip()
        if draw.textbbox((0, 0), proposed, font=face)[2] <= width:
            line = proposed
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines

def text_lines(draw, xy, text, face, color, width, spacing):
    x, y = xy
    for line in wrap(draw, text, face, width):
        draw.text((x, y), line, font=face, fill=color)
        y += spacing
    return y

def background():
    im = Image.new("RGB", (1920, 1080))
    pix = im.load()
    for y in range(1080):
        for x in range(1920):
            glow = max(0, 1 - ((x - 1510) ** 2 / 1450 ** 2 + (y - 230) ** 2 / 850 ** 2))
            pix[x, y] = (int(17 + 20 * glow), int(28 + 43 * glow), int(24 + 27 * glow))
    return im

def screenshot_panel(im, key):
    panel = (965, 186, 1815, 861)
    shadow = Image.new("RGBA", im.size)
    ImageDraw.Draw(shadow).rounded_rectangle((panel[0]+18, panel[1]+22, panel[2]+18, panel[3]+22), radius=20, fill=(0,0,0,130))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    im.paste(Image.new("RGB", im.size, "#070e0a"), (0, 0), shadow.getchannel("A"))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(panel, radius=17, fill="#f7f5ee", outline="#6b8975", width=2)
    d.rounded_rectangle((965, 186, 1815, 232), radius=17, fill="#e5e6dc")
    d.rectangle((965, 215, 1815, 232), fill="#e5e6dc")
    for j, c in enumerate(("#dc7554", "#c9cebc", "#c9cebc")):
        d.ellipse((990 + j*24, 203, 1001 + j*24, 214), fill=c)
    d.text((1300, 195), "corpshift / protocol lab", font=MONO(16), fill="#526657")
    src = Image.open(ROOT / "docs" / "visual-review" / "stages" / f"{key}-1440.png").convert("RGB")
    crop = src.crop((70, 620, 1370, 1580)).resize((846, 625), Image.Resampling.LANCZOS)
    im.paste(crop, (967, 234))

def special_panel(im, kind):
    d = ImageDraw.Draw(im)
    box = (980, 205, 1815, 850)
    d.rounded_rectangle(box, radius=18, fill="#1c3a2b", outline="#648a70", width=2)
    if kind == "hero":
        d.text((1090, 290), "1 : 4", font=BOLD(170), fill="#f2efe7")
        d.line((1100, 515, 1700, 515), fill="#83a28b", width=2)
        d.text((1070, 590), "$100 → $25", font=BOLD(94), fill="#e89872")
    elif kind == "evidence":
        labels = ["Attested action", "Onchain state", "Transaction receipts", "Expected contract errors"]
        for i, label in enumerate(labels):
            x = 1015 + (i % 2) * 385
            y = 250 + (i // 2) * 265
            d.rounded_rectangle((x, y, x+350, y+225), radius=12, fill="#f0f1e7")
            d.text((x+28, y+22), "✓", font=BOLD(62), fill="#347a55")
            text_lines(d, (x+28, y+120), label, BOLD(28), "#21432f", 300, 34)
    else:
        d.ellipse((1120, 260, 1680, 820), outline="#789d81", width=4)
        d.text((1240, 345), "C", font=BOLD(355), fill="#edf1e9")
        d.polygon([(1525, 341), (1575, 291), (1625, 341), (1575, 391)], fill="#e58c67")

base = background()
for i, (eyebrow, title, deck, visual, weight) in enumerate(SCENES):
    im = base.copy()
    d = ImageDraw.Draw(im)
    d.polygon([(105, 81), (121, 65), (137, 81), (121, 97)], fill="#e17854")
    d.text((151, 62), "CorpShift.", font=BOLD(30), fill="#f2f0e8")
    d.text((1662, 68), f"{i+1:02d} / {len(SCENES):02d}", font=MONO(22), fill="#bfccbe")
    d.text((105, 275), eyebrow, font=MONO(24), fill="#e89774")
    headline_size = 82 if i not in (0, 8) else 78
    y = text_lines(d, (105, 333), title, BOLD(headline_size), "#f5f2e9", 800, headline_size + 5)
    text_lines(d, (110, y + 40), deck, REG(33), "#cad7c9", 780, 46)
    if visual.startswith("lab-"):
        screenshot_panel(im, visual)
    else:
        special_panel(im, visual)
    d = ImageDraw.Draw(im)
    d.line((105, 968, 1815, 968), fill="#557365", width=2)
    d.text((105, 992), "THE CORPORATE-ACTION RUNTIME", font=MONO(20), fill="#aebfad")
    d.text((1482, 992), "ONCHAIN FINANCE / DEMO", font=MONO(20), fill="#aebfad")
    im.save(OUT / f"slide-{i:02d}.png", optimize=True)

(OUT / "slides-manifest.json").write_text(json.dumps([{"eyebrow": s[0], "title": s[1], "deck": s[2], "weight": s[4]} for s in SCENES], indent=2), encoding="utf-8")
print(f"Rendered {len(SCENES)} slides in {OUT}")
