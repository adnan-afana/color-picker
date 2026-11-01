"""
Builds the grill and plate layers from the restaurant's own food photos.

Inputs (tools/reference/supplied/)
  kebab-skewer.png, tawook-skewer.png, half-chicken.png   isolated food, transparent
  kebab-dish.webp, tawook-dish.webp                       complete dish photos

Outputs
  public/assets/grill/<id>-food.png / <id>-metal.png   upright skewer layers for each grill slot
  public/assets/grill/chicken.png                      half chicken for the basket
  public/assets/plates/<dish>-full.webp                 complete dish, background removed
  public/assets/plates/<dish>-empty.webp                the same plate with the food removed (same canvas)
  public/config/grill-items.json                       where every layer sits on the grill photo
  public/config/dish-layout.json                       where the protein sits in each dish photo

Skewers are stored upright (tip up, handle down); `axis` in grill-items.json
is the rotation that lays each one at its angle on the grill.

Run:  python3 tools/prepare_supplied_food.py
Needs: numpy, pillow, opencv-python-headless, rembg
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
SUP = HERE / "reference" / "supplied"
ASSETS = HERE.parent / "public" / "assets"
CONFIG = HERE.parent / "public" / "config"
FRAME = (1672, 941)
SCALE = 2  # output pixels per grill-frame pixel, so layers stay sharp when zoomed

# Skewer slots on the grill, read from the approved composite:
# tip and handle-end points in grill-frame pixels.
SLOTS = {
    "tawook-1": ((724, 266), (624, 684)),
    "tawook-2": ((811, 254), (772, 686)),
    "tawook-3": ((897, 255), (889, 686)),
    "kebab-1": ((977, 241), (1008, 686)),
    "kebab-2": ((1072, 258), (1142, 684)),
    "kebab-3": ((1171, 259), (1273, 686)),
    "kebab-4": ((1264, 259), (1413, 687)),
}
FLIP = {"tawook-2", "kebab-2", "kebab-4"}  # mirror every other copy so the row isn't identical
CHICKEN_CENTER, CHICKEN_WIDTH, CHICKEN_ROTATION = (376, 432), 350, -4
# No complete half-chicken dish photo was supplied: the chicken lands on the same
# black plate (emptied), and its finished image is composed from that exact pose.
CHICKEN_ON_PLATE = {"x": 0.0, "y": 0.015, "rotation": -6, "width": 0.6}


def load_rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA")).copy()


def crop_to_alpha(a: np.ndarray, pad=2) -> np.ndarray:
    ys, xs = np.where(a[..., 3] > 8)
    return a[max(0, ys.min() - pad):ys.max() + pad + 1, max(0, xs.min() - pad):xs.max() + pad + 1]


def split_skewer(img: np.ndarray):
    """Separate meat from metal by row width; rebuild the metal hidden inside the meat."""
    alpha = img[..., 3].astype(np.float32) / 255
    width = (alpha > 0.5).sum(axis=1)
    meat_rows = np.where(width > 0.55 * width.max())[0]
    m0, m1 = int(meat_rows.min()), int(meat_rows.max())
    rows = np.arange(img.shape[0])[:, None]
    meat_band = (rows >= m0 - 2) & (rows <= m1 + 2)
    food = img.copy()
    food[..., 3] = (food[..., 3] * meat_band).astype(np.uint8)
    metal = img.copy()
    metal[..., 3] = (metal[..., 3] * ~meat_band).astype(np.uint8)
    # the visible metal just below the meat, repeated up through the meat
    strip = metal[m1 + 8:m1 + 40].astype(np.float32)
    profile = (strip[..., :3] * strip[..., 3:4]).sum(0) / np.maximum(strip[..., 3:4].sum(0), 1)
    prof_a = strip[..., 3].mean(0)
    inner = np.zeros_like(metal)
    inner[m0 - 6:m1 + 9, :, :3] = profile.astype(np.uint8)
    inner[m0 - 6:m1 + 9, :, 3] = prof_a.astype(np.uint8)
    metal = np.where(inner[..., 3:4] > metal[..., 3:4], inner, metal)
    return food, metal, (m0, m1)


def centroid(alpha: np.ndarray) -> list[float]:
    a = alpha.astype(np.float32)
    ys, xs = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    return [round(float((xs * a).sum() / a.sum() / a.shape[1]), 4), round(float((ys * a).sum() / a.sum() / a.shape[0]), 4)]


def resize(a: np.ndarray, w: int, h: int) -> np.ndarray:
    return np.asarray(Image.fromarray(a, "RGBA").resize((w, h), Image.LANCZOS))


def save(a: np.ndarray, path: Path):
    Image.fromarray(a, "RGBA").save(path, optimize=True)


# ------------------------------------------------------------------- grill
def build_grill(layout: dict):
    out = ASSETS / "grill"
    out.mkdir(parents=True, exist_ok=True)
    sources = {k: crop_to_alpha(load_rgba(SUP / f"{k}-skewer.png")) for k in ("kebab", "tawook")}
    for slot, (tip, end) in SLOTS.items():
        src = sources[slot.split("-")[0]]
        if slot in FLIP:
            src = src[:, ::-1].copy()
        food, metal, (m0, m1) = split_skewer(src)
        length = math.dist(tip, end)
        s = length / src.shape[0]                      # grill-frame px per source px
        w, h = src.shape[1] * s, src.shape[0] * s
        ow, oh = round(w * SCALE), round(h * SCALE)
        save(resize(food, ow, oh), out / f"{slot}-food.png")
        save(resize(metal, ow, oh), out / f"{slot}-metal.png")
        cx, cy = (tip[0] + end[0]) / 2, (tip[1] + end[1]) / 2
        axis = math.degrees(math.atan2(-(end[0] - tip[0]), end[1] - tip[1]))
        layout["items"][slot] = {
            "box": [round(cx - w / 2, 1), round(cy - h / 2, 1), round(cx + w / 2, 1), round(cy + h / 2, 1)],
            "axis": round(axis, 2),
            "meat": [round(m0 * s, 1), round(m1 * s, 1)],
            "center": centroid(food[..., 3]),
            "meatWidth": round(float((food[..., 3] > 128).sum(1).max()) * s, 1),
        }

    chicken = crop_to_alpha(load_rgba(SUP / "half-chicken.png"))
    s = CHICKEN_WIDTH / chicken.shape[1]
    w, h = chicken.shape[1] * s, chicken.shape[0] * s
    save(resize(chicken, round(w * SCALE), round(h * SCALE)), out / "chicken.png")
    cx, cy = CHICKEN_CENTER
    layout["items"]["chicken"] = {
        "box": [round(cx - w / 2, 1), round(cy - h / 2, 1), round(cx + w / 2, 1), round(cy + h / 2, 1)],
        "axis": CHICKEN_ROTATION,
        "center": centroid(chicken[..., 3]),
    }


# ------------------------------------------------------------------ dishes
def empty_plate(rgb: np.ndarray):
    """
    The same plate with everything on it removed.

    The plate is fitted as an ellipse, then every covered pixel is rebuilt from
    the median colour of the visible ceramic at the same distance from the
    centre and the same angle, so the rim and shading stay those of the photo.
    """
    rgbf = rgb.astype(np.float32)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    H, W = hsv.shape[:2]
    dark = ((hsv[..., 2] < 95) & (hsv[..., 1] < 110)).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(dark, 8)
    dark = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    contour = max(cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=len)
    (cx, cy), (a2, b2), ang = cv2.fitEllipse(cv2.convexHull(contour))
    t = math.radians(ang)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dx, dy = xx - cx, yy - cy
    u = (dx * math.cos(t) + dy * math.sin(t)) / (a2 / 2)
    v = (-dx * math.sin(t) + dy * math.cos(t)) / (b2 / 2)
    rho, theta = np.sqrt(u * u + v * v), np.arctan2(v, u)
    inside = rho <= 1.0
    known = (dark > 0) & inside

    RB, TB = 24, 36
    ri = np.clip((rho * RB).astype(int), 0, RB - 1)
    ti = ((theta + np.pi) / (2 * np.pi) * TB).astype(int) % TB
    grid = np.full((RB, TB, 3), np.nan, np.float32)
    for r in range(RB):
        for k in range(TB):
            m = known & (ri == r) & (ti == k)
            if m.sum() > 40:
                grid[r, k] = np.median(rgbf[m], axis=0)
    for r in range(RB):
        ok = ~np.isnan(grid[r, :, 0])
        if ok.any():
            grid[r, ~ok] = np.nanmedian(grid[r], axis=0)
    filled_rows = [q for q in range(RB) if not np.isnan(grid[q, 0, 0])]
    for r in range(RB):
        if np.isnan(grid[r, 0, 0]):
            grid[r] = grid[min(filled_rows, key=lambda q: abs(q - r))]
    g = cv2.GaussianBlur(np.concatenate([grid[:, -4:], grid, grid[:, :4]], 1), (0, 0), 1.6)[:, 4:-4]

    fr = np.clip(rho * RB - 0.5, 0, RB - 1)
    ft = ((theta + np.pi) / (2 * np.pi) * TB - 0.5) % TB
    r0 = np.floor(fr).astype(int)
    r1 = np.minimum(r0 + 1, RB - 1)
    wr = (fr - r0)[..., None]
    t0 = np.floor(ft).astype(int) % TB
    t1 = (t0 + 1) % TB
    wt = (ft - np.floor(ft))[..., None]
    fill = g[r0, t0] * (1 - wr) * (1 - wt) + g[r1, t0] * wr * (1 - wt) + g[r0, t1] * (1 - wr) * wt + g[r1, t1] * wr * wt
    grain = np.random.default_rng(1).normal(0, 1, (H, W)).astype(np.float32)
    fill += cv2.GaussianBlur(grain, (0, 0), 1.2)[..., None] * 2.0

    missing = inside & (dark == 0)
    f = cv2.GaussianBlur(cv2.dilate(missing.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(np.float32), (0, 0), 3)[..., None]
    empty = np.clip(rgbf * (1 - f) + fill * f, 0, 255).astype(np.uint8)
    alpha = np.clip((1.0 - rho) / 0.004, 0, 1)
    return empty, alpha


def build_dishes():
    from rembg import new_session, remove

    session = new_session("isnet-general-use")
    out = ASSETS / "plates"
    dish_layout = {}

    for dish in ("kebab", "tawook"):
        rgb = np.asarray(Image.open(SUP / f"{dish}-dish.webp").convert("RGB")).copy()
        H, W = rgb.shape[:2]
        alpha = np.asarray(remove(Image.fromarray(rgb), session=session, only_mask=True), np.float32) / 255
        alpha = np.clip((alpha - 0.1) / 0.8, 0, 1)
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        rice = (hsv[..., 0] >= 16) & (hsv[..., 0] <= 30) & (hsv[..., 1] > 150) & (hsv[..., 2] > 140)  # tawook pieces sit on rice

        if dish == "kebab":
            kebabs = [((432, 694), (1074, 1282), 104), ((590, 580), (1188, 1166), 97)]
            placements = [
                {"center": [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], "length": math.dist(p, q) - 2 * r * 0.6,
                 "width": 2 * r, "rotation": math.degrees(math.atan2(-(q[0] - p[0]), q[1] - p[1]))}
                for p, q, r in kebabs
            ]
        else:
            # Chicken pieces: on the rice, not rice-coloured, not the dark plate; left of the potatoes.
            roi = np.zeros((H, W), bool)
            cv2.fillPoly(roi.view(np.uint8), [np.array([(340, 560), (700, 520), (1060, 690), (1215, 900), (1215, 1320), (900, 1330), (420, 1080), (330, 760)])], 1)
            roi = roi.view(bool)
            plate_dark = (hsv[..., 2] < 80) & (hsv[..., 1] < 90)
            pieces = roi & ~rice & ~plate_dark
            pieces = cv2.morphologyEx(pieces.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
            pieces = cv2.morphologyEx(pieces, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
            n, lab, st, _ = cv2.connectedComponentsWithStats(pieces, 8)
            keep = np.zeros_like(pieces)
            for i in range(1, n):
                if st[i, cv2.CC_STAT_AREA] > 4000:
                    keep[lab == i] = 1
            ys, xs = np.where(keep > 0)
            # two skewers laid along the long direction of the chicken pile
            pts = np.column_stack([xs, ys]).astype(np.float32)
            mean = pts.mean(0)
            cov = np.cov((pts - mean).T)
            evals, evecs = np.linalg.eigh(cov)
            major, minor = evecs[:, 1], evecs[:, 0]
            span = 2.0 * math.sqrt(evals[1])
            offset = 0.9 * math.sqrt(evals[0])
            rot = math.degrees(math.atan2(-major[0], major[1]))
            if rot > 90:  # point the handles down and to the right, like the kebabs
                rot -= 180
            elif rot < -90:
                rot += 180
            placements = [
                {"center": [float(mean[0] + minor[0] * k * offset), float(mean[1] + minor[1] * k * offset)],
                 "length": span * 1.3, "width": None, "rotation": rot}
                for k in (-1, 1)
            ]

        empty, empty_alpha = empty_plate(rgb)
        # crop both versions to the plate, same box
        ys, xs = np.where(alpha > 0.05)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        bw, bh = x1 - x0, y1 - y0
        out_w = 1100
        k = out_w / bw
        for name, img, a in (("full", rgb, alpha), ("empty", empty, empty_alpha)):
            rgba = np.dstack([img, (a * 255).astype(np.uint8)])[y0:y1, x0:x1]
            Image.fromarray(rgba, "RGBA").resize((out_w, round(bh * k)), Image.LANCZOS).save(out / f"{dish}-{name}.webp", quality=86, method=6)
        dish_layout[dish] = {
            "aspect": round(bw / bh, 4),
            "items": [
                {
                    "x": round((pl["center"][0] - x0 - bw / 2) / bw, 4),
                    "y": round((pl["center"][1] - y0 - bh / 2) / bw, 4),
                    "rotation": round(pl["rotation"], 1),
                    "length": round(pl["length"] / bw, 4),
                    "thickness": round(pl["width"] / bw, 4) if pl["width"] else None,
                }
                for pl in placements
            ],
        }
    # Half chicken: empty plate from the tawook photo, chicken composed at its landing pose.
    plate = Image.open(out / "tawook-empty.webp").convert("RGBA")
    plate.save(out / "chicken-empty.webp", quality=86, method=6)
    chicken = Image.open(ASSETS / "grill" / "chicken.png").convert("RGBA")
    place = CHICKEN_ON_PLATE
    pw = plate.width
    w = place["width"] * pw
    h = w * chicken.height / chicken.width
    fx, fy = centroid(np.asarray(chicken)[..., 3])
    ox, oy = (fx - 0.5) * w, (fy - 0.5) * h
    r = math.radians(place["rotation"])
    rx, ry = ox * math.cos(r) - oy * math.sin(r), ox * math.sin(r) + oy * math.cos(r)
    piece = chicken.resize((round(w), round(h)), Image.LANCZOS).rotate(-place["rotation"], resample=Image.BICUBIC, expand=True)
    tx, ty = pw / 2 + place["x"] * pw, plate.height / 2 + place["y"] * pw
    # same soft contact shadow the page draws under the plated food
    shade = Image.new("RGBA", piece.size, (0, 0, 0, 0))
    shade.putalpha(piece.getchannel("A").point(lambda v: int(v * 0.45)))
    from PIL import ImageFilter
    shade = shade.filter(ImageFilter.GaussianBlur(8))
    full = plate.copy()
    pos = (round(tx - rx - piece.width / 2), round(ty - ry - piece.height / 2))
    full.alpha_composite(shade, (pos[0] + 4, pos[1] + 8))
    full.alpha_composite(piece, pos)
    full.save(out / "chicken-full.webp", quality=86, method=6)
    dish_layout["chicken"] = {"aspect": round(plate.width / plate.height, 4), "items": [dict(place)]}

    (CONFIG / "dish-layout.json").write_text(json.dumps(dish_layout, indent=2) + "\n")


def main():
    layout_path = CONFIG / "grill-items.json"
    layout = json.loads(layout_path.read_text())
    layout["scale"] = SCALE
    build_grill(layout)
    layout_path.write_text(json.dumps(layout, indent=2) + "\n")
    build_dishes()
    print("done")


if __name__ == "__main__":
    main()
