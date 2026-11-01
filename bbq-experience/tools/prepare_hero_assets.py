"""
Builds the hero assets from the approved reference screenshot.

The reference is a flattened mock-up (photo + logo + nav + headline). This
script separates it into clean, independently replaceable layers:

  public/assets/hero/grill-hero.jpg  background with logo, nav and headline removed,
                                     lower front panel blurred and faded to black
  public/assets/hero/flames.png      flames only (transparent) for the flicker layer
  public/assets/brand/logo.png       logo with the background keyed out

Run:  python3 tools/prepare_hero_assets.py path/to/reference.png
Needs: numpy, pillow, opencv-python-headless

When the original logo file arrives, drop it in as public/assets/brand/logo.png.
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "assets"

# Regions of the 1672 × 941 reference, as fractions (x0, y0, x1, y1).
LOGO = (0.026, 0.006, 0.19, 0.145)
NAV = (0.56, 0.025, 0.98, 0.122)
HEADLINE = (0.026, 0.835, 0.675, 0.95)


def box(frac, w, h, pad=0):
    x0, y0, x1, y1 = frac
    return (max(0, int(x0 * w) - pad), max(0, int(y0 * h) - pad),
            min(w, int(x1 * w) + pad), min(h, int(y1 * h) + pad))


def text_mask(img: np.ndarray, frac, thresh: float) -> np.ndarray:
    """Mask of bright UI pixels (text, logo, button) inside a region, dilated."""
    h, w = img.shape[:2]
    x0, y0, x1, y1 = box(frac, w, h)
    m = np.zeros((h, w), np.uint8)
    region = img[y0:y1, x0:x1].astype(np.float32)
    lum = region.max(axis=2)
    m[y0:y1, x0:x1] = (lum > thresh).astype(np.uint8) * 255
    return cv2.dilate(m, np.ones((9, 9), np.uint8), iterations=2)


def main(ref_path: str):
    (ROOT / "hero").mkdir(parents=True, exist_ok=True)
    (ROOT / "brand").mkdir(parents=True, exist_ok=True)
    rgb = np.asarray(Image.open(ref_path).convert("RGB"))
    h, w = rgb.shape[:2]
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

    # ---- clean background: remove logo, nav + button, headline
    mask = np.zeros((h, w), np.uint8)
    # logo and button are fully replaced (whole box); text strokes elsewhere
    for frac in (LOGO,):
        x0, y0, x1, y1 = box(frac, w, h, 6)
        mask[y0:y1, x0:x1] = 255
    bx0 = int(0.833 * w)  # ORDER NOW button block
    x0, y0, x1, y1 = box(NAV, w, h, 6)
    mask[y0:y1, bx0:x1] = 255
    mask |= text_mask(rgb, (NAV[0], NAV[1], 0.835, NAV[3]), 120)
    mask |= text_mask(rgb, HEADLINE, 120)
    clean = cv2.inpaint(bgr, mask, 9, cv2.INPAINT_TELEA)
    # soften the inpainted patches so no edges remain
    soft = cv2.GaussianBlur(clean, (0, 0), 14)
    feather = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 10)[..., None]
    clean = (clean * (1 - feather) + soft * feather).astype(np.uint8)

    # ---- selective blur + fade on the lower front panel (cooking surface stays sharp)
    yy = np.arange(h, dtype=np.float32)[:, None, None] / h
    ramp = np.clip((yy - 0.70) / 0.14, 0, 1)
    blurred = cv2.GaussianBlur(clean, (0, 0), 9)
    out = clean * (1 - ramp) + blurred * ramp
    dark = np.clip((yy - 0.74) / 0.26, 0, 1) ** 1.2 * 0.85
    out = out * (1 - dark)
    clean_rgb = cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_BGR2RGB)
    Image.fromarray(clean_rgb).save(ROOT / "hero" / "grill-hero.jpg", quality=90, optimize=True)

    # ---- flames layer: hot orange/yellow pixels on the cooking surface only
    f = rgb.astype(np.float32) / 255
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    hot = np.clip((r - 0.75) / 0.2, 0, 1) * np.clip((g - 0.25) / 0.3, 0, 1) * np.clip((r - b - 0.35) / 0.3, 0, 1)
    zone = ((yy[..., 0] > 0.33) & (yy[..., 0] < 0.71)).astype(np.float32)
    alpha = cv2.GaussianBlur(hot * zone, (0, 0), 1.5)
    alpha = np.clip(alpha * 1.4, 0, 1)
    a8 = (alpha * 255).astype(np.uint8)
    # zero colour where fully transparent so the PNG compresses well
    flames = np.dstack([rgb * (a8 > 0)[..., None], a8]).astype(np.uint8)
    Image.fromarray(flames, "RGBA").save(ROOT / "hero" / "flames.png", optimize=True)

    # ---- logo: key against the inpainted background behind it
    x0, y0, x1, y1 = box(LOGO, w, h, 4)
    C = rgb[y0:y1, x0:x1].astype(np.float32) / 255
    B = cv2.cvtColor(clean, cv2.COLOR_BGR2RGB)[y0:y1, x0:x1].astype(np.float32) / 255
    diff = np.abs(C - B).max(axis=2)
    a = np.clip((diff - 0.09) / 0.2, 0, 1)
    a = cv2.GaussianBlur(a, (0, 0), 0.6)
    F = np.clip((C - (1 - a[..., None]) * B) / np.maximum(a[..., None], 1e-3), 0, 1)
    logo = np.dstack([F, a])
    logo_img = Image.fromarray((logo * 255).astype(np.uint8), "RGBA")
    logo_img = logo_img.crop(logo_img.getbbox())
    # 2× upscale so it stays crisp on high-density screens
    logo_img = logo_img.resize((logo_img.width * 2, logo_img.height * 2), Image.LANCZOS)
    logo_img.save(ROOT / "brand" / "logo.png", optimize=True)
    print("done:", ROOT / "hero", ROOT / "brand")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: prepare_hero_assets.py reference.png")
    main(sys.argv[1])
