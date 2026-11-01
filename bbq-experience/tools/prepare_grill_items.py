"""
Cuts every food item out of the approved grill composite so each one can be
animated on its own.

Input   tools/reference/grill-food-reference.png   (1672 × 941 approved composite)
Output  public/assets/grill/<id>-food.png     meat only (transparent)
        public/assets/grill/<id>-metal.png    skewer tip + handle, with the hidden rod
                                              through the meat rebuilt so it can slide out
        public/assets/grill/chicken.png       half chicken with the basket wires removed
        public/assets/grill/basket-lid.png    redrawn wire lid (opens before the chicken lifts)
        public/assets/grill/basket-base.png   redrawn wire base + handle (stays on the grill)
        public/config/grill-items.json        position of every cut-out on the grill (% of the photo)

Run:  python3 tools/prepare_grill_items.py
Needs: numpy, pillow, opencv-python-headless, rembg (downloads its model on first run)
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
REF = HERE / "reference" / "grill-food-reference.png"
OUT = HERE.parent / "public" / "assets" / "grill"
LAYOUT = HERE.parent / "public" / "config" / "grill-items.json"
W, H = 1672, 941

# Skewer axes read from the composite: (tip x at y=270, handle x at y=670).
SKEWERS = {
    "tawook-1": (725, 627),
    "tawook-2": (810, 773),
    "tawook-3": (897, 889),
    "kebab-1": (978, 1007),
    "kebab-2": (1074, 1141),
    "kebab-3": (1173, 1270),
    "kebab-4": (1266, 1405),
}
Y_TOP, Y_BOT = 240, 700
BASKET_BOX = (140, 235, 615, 730)


def axis_x(item: str, y: np.ndarray) -> np.ndarray:
    tip, handle = SKEWERS[item]
    return tip + (handle - tip) * (y - 270) / 400.0


def matte() -> np.ndarray:
    """Foreground matte of all food, from a salient-object model."""
    from rembg import new_session, remove

    im = Image.open(REF).convert("RGB")
    box = (130, 230, 1440, 740)
    m = remove(im.crop(box), session=new_session("isnet-general-use"), only_mask=True)
    full = np.zeros((H, W), np.float32)
    full[box[1]:box[3], box[0]:box[2]] = np.asarray(m, np.float32) / 255
    return full


def levels(a, lo, hi):
    return np.clip((a - lo) / (hi - lo), 0, 1)


def largest_component(mask: np.ndarray) -> np.ndarray:
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 1:
        return mask
    keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return lab == keep


def centroid(alpha: np.ndarray, box) -> list[float]:
    """Centre of the food as a fraction of its box (where it should land on the plate)."""
    x0, y0, x1, y1 = box
    a = alpha[y0:y1, x0:x1]
    ys, xs = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    return [round(float((xs * a).sum() / a.sum() / a.shape[1]), 4), round(float((ys * a).sum() / a.sum() / a.shape[0]), 4)]


def save_crop(rgba: np.ndarray, box, name: str):
    x0, y0, x1, y1 = box
    Image.fromarray(rgba[y0:y1, x0:x1], "RGBA").save(OUT / name, optimize=True)


def rgba(rgb, alpha):
    a8 = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    return np.dstack([rgb * (a8 > 0)[..., None], a8]).astype(np.uint8)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rgb = np.asarray(Image.open(REF).convert("RGB"))
    M = matte()
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    names = list(SKEWERS)
    layout = {"frame": {"width": W, "height": H}, "items": {}}

    for i, name in enumerate(names):
        ax = axis_x(name, yy)
        left = (axis_x(names[i - 1], yy) + ax) / 2 if i > 0 else ax - 75
        right = (axis_x(names[i + 1], yy) + ax) / 2 if i < len(names) - 1 else ax + 75
        zone = (xx >= left) & (xx < right) & (yy >= Y_TOP) & (yy <= Y_BOT)
        a = levels(M, 0.18, 0.6) * zone
        # drop thin horizontal grill rails that the matte picks up
        solid = cv2.morphologyEx((a > 0.5).astype(np.uint8), cv2.MORPH_OPEN, np.ones((29, 1), np.uint8))
        solid = largest_component(solid > 0)
        solid = cv2.dilate(solid.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        a = a * solid
        a = cv2.GaussianBlur(a, (0, 0), 0.7)

        # split meat from metal by the width of each row
        width = (a > 0.5).sum(axis=1)
        rows = np.where(width > 0)[0]
        meat_rows = np.where(width > 0.5 * width.max())[0]
        m_top, m_bot = int(meat_rows.min()), int(meat_rows.max())
        meat_band = (yy >= m_top - 2) & (yy <= m_bot + 2)
        food_a = a * meat_band
        metal_a = a * ~meat_band

        # rebuild the rod hidden inside the meat so the skewer can slide out cleanly
        tip_w, handle_w = 7.0, 26.0
        t = np.clip((yy - 270) / 400, 0, 1)
        rod_half = (tip_w + (handle_w - tip_w) * t) / 2
        d = np.abs(xx - ax)
        rod = meat_band & (d < rod_half) & (yy <= Y_BOT)
        shade = 0.55 + 0.4 * np.cos(np.clip(d / np.maximum(rod_half, 1), 0, 1) * math.pi / 2)
        rod_rgb = np.dstack([shade * 205, shade * 190, shade * 170])
        metal_rgb = np.where(rod[..., None], rod_rgb, rgb)
        metal_a = np.maximum(metal_a, rod.astype(np.float32))

        ys, xs = np.where(a > 0.02)
        box = (int(xs.min()) - 2, int(ys.min()) - 2, int(xs.max()) + 3, int(ys.max()) + 3)
        save_crop(rgba(rgb, food_a), box, f"{name}-food.png")
        save_crop(rgba(metal_rgb, metal_a), box, f"{name}-metal.png")
        tip, handle = SKEWERS[name]
        layout["items"][name] = {
            "box": box,
            "center": centroid(food_a, box),
            "meat": [m_top - box[1], m_bot - box[1]],
            # direction tip → handle, in CSS rotation degrees (0 = pointing straight down)
            "axis": round(math.degrees(math.atan2(-(handle - tip), 400)), 2),
        }

    # ---------------------------------------------------------- basket + chicken
    # The photographed wires are replaced by a redrawn basket (basket_geometry.py),
    # so only the chicken is cut from the photo, with the wires painted out of it.
    import basket_geometry

    x0, y0, x1, y1 = BASKET_BOX
    crop = rgb[y0:y1, x0:x1].copy()
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY).astype(np.float32)
    disk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    dark = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, disk)
    bright = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, disk)

    def line_kernel(length, deg):
        k = np.zeros((length, length), np.uint8)
        c, t = length // 2, math.radians(deg)
        dx, dy = math.cos(t) * c, math.sin(t) * c
        cv2.line(k, (round(c - dx), round(c - dy)), (round(c + dx), round(c + dy)), 1, 1)
        return k

    # Wires are long straight dark/bright lines along the basket's two directions;
    # char on the skin is blotchy, so a line-shaped opening keeps only the wires.
    rd, rb = np.zeros_like(gray), np.zeros_like(gray)
    for deg in list(range(0, 10, 2)) + list(range(100, 124, 3)):
        k = line_kernel(31, deg)
        rd = np.maximum(rd, cv2.morphologyEx(dark, cv2.MORPH_OPEN, k))
        rb = np.maximum(rb, cv2.morphologyEx(bright, cv2.MORPH_OPEN, k))
    wires = cv2.dilate(((rd > 14) | (rb > 16)).astype(np.uint8), np.ones((3, 3), np.uint8))
    clean = cv2.inpaint(crop, wires * 255, 3, cv2.INPAINT_TELEA)

    from rembg import new_session, remove
    m = np.asarray(remove(Image.fromarray(clean), session=new_session("isnet-general-use"), only_mask=True), np.float32) / 255
    hsv = cv2.cvtColor(clean, cv2.COLOR_RGB2HSV).astype(np.float32)
    flesh = (hsv[..., 1] > 105) & (hsv[..., 2] > 95) & ((hsv[..., 0] < 22) | (hsv[..., 0] > 170))
    body = ((m > 0.42) & flesh).astype(np.uint8)
    body = cv2.morphologyEx(body, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
    ff = body.copy()
    cv2.floodFill(ff, np.zeros((ff.shape[0] + 2, ff.shape[1] + 2), np.uint8), (0, 0), 1)
    body = body | (1 - ff)  # fill holes
    body = cv2.morphologyEx(body, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    body = largest_component(body > 0).astype(np.uint8)
    body = cv2.erode(body, np.ones((3, 3), np.uint8))
    chicken_a = np.zeros((H, W), np.float32)
    chicken_a[y0:y1, x0:x1] = cv2.GaussianBlur(body.astype(np.float32), (0, 0), 1.4)
    chicken_rgb = rgb.copy()
    chicken_rgb[y0:y1, x0:x1] = clean

    lid = np.asarray(basket_geometry.render("lid"))
    base = np.asarray(basket_geometry.render("base", tone=0.75))

    def bbox(a):
        ys, xs = np.where(a > 0.02)
        return (int(xs.min()) - 2, int(ys.min()) - 2, int(xs.max()) + 3, int(ys.max()) + 3)

    cb, lb, bb = bbox(chicken_a), bbox(lid[..., 3] / 255), bbox(base[..., 3] / 255)
    save_crop(rgba(chicken_rgb, chicken_a), cb, "chicken.png")
    save_crop(lid, lb, "basket-lid.png")
    save_crop(base, bb, "basket-base.png")
    layout["items"]["chicken"] = {"box": cb, "center": centroid(chicken_a, cb)}
    layout["items"]["basket-lid"] = {"box": lb}
    layout["items"]["basket-base"] = {"box": bb}

    LAYOUT.write_text(json.dumps(layout, indent=2) + "\n")
    print("wrote", OUT, LAYOUT)


if __name__ == "__main__":
    main()
