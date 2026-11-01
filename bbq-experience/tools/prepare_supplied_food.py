"""
Builds every food and plate layer from the restaurant's own photos.

Inputs (tools/reference/supplied/)
  kebab-dish.webp, tawook-dish.webp   complete dish photos
  kebab-skewer.png, tawook-skewer.png isolated skewers (only their metal is used)
  half-chicken.png                    isolated half chicken

The protein that lands on each plate is the protein cut from that plate's own
photo, so it looks the same on the grill, in the air and on the plate:
  - kebab: the two kebabs from the kebab photo, threaded on the real kebab skewer metal;
  - shish tawook: the ten chicken pieces from the tawook photo, five per skewer,
    which fan out to their exact spots in the photo after landing;
  - half chicken: the isolated half-chicken photo (no half-chicken dish photo exists).

Each dish photo becomes:
  plates/<dish>-base.webp       the photo with ONLY the protein removed; the rice
                                under it is rebuilt from the photo's own rice (quilting)
  plates/<dish>-reference.webp  the untouched photo, for comparison in owner mode
The half-chicken plate reuses the kebab plate's base: same plate, rice and sides.

Writes public/config/food-layout.json (movers, pieces, plates) and the skewer and
chicken entries of public/config/grill-items.json.

Run:  python3 tools/prepare_supplied_food.py
Needs: numpy, pillow, opencv-contrib-python-headless, rembg (downloads models on first run)
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from dish_cutouts import fill_holes, keep_large, kebab_masks, quilt_fill

HERE = Path(__file__).resolve().parent
SUP = HERE / "reference" / "supplied"
PUB = HERE.parent / "public"
ASSETS = PUB / "assets"
CONFIG = PUB / "config"
PLATE_W = 1100  # working and output width of every plate image
HANDLE_KEEP = 0.4  # share of the skewer handle kept below the meat

# Skewer slots on the grill (tip and handle end, grill-frame px), from the approved composite.
SLOTS = {
    "tawook-1": ((724, 266), (624, 684)),
    "tawook-2": ((811, 254), (772, 686)),
    "tawook-3": ((897, 255), (889, 686)),
    "kebab-1": ((977, 241), (1008, 686)),
    "kebab-2": ((1072, 258), (1142, 684)),
    "kebab-3": ((1171, 259), (1273, 686)),
    "kebab-4": ((1264, 259), (1413, 687)),
}
CHICKEN_CENTER, CHICKEN_WIDTH, CHICKEN_ROTATION = (376, 432), 350, -4

# Kebabs in the kebab photo (full-resolution px): end, end, radius. Lower kebab is in front.
KEBABS = [((432, 694), (1074, 1282), 112), ((590, 580), (1188, 1166), 104)]
# One point on each chicken piece in the tawook photo (full-resolution px).
TAWOOK_POINTS = [(620, 620), (480, 740), (750, 720), (820, 820), (610, 870),
                 (710, 1010), (980, 960), (1130, 1050), (860, 1110), (1030, 1200)]
# Where the half chicken lies on its plate (fractions of the plate width; degrees).
CHICKEN_ON_PLATE = {"x": -0.1, "y": 0.13, "rotation": -36, "width": 0.46}


# ----------------------------------------------------------------- helpers
def css_angle(p, q) -> float:
    """CSS rotation that turns 'pointing straight down' into the direction p → q."""
    return math.degrees(math.atan2(-(q[0] - p[0]), q[1] - p[1]))


def rotate_rgba(a: np.ndarray, css_deg: float) -> np.ndarray:
    return np.asarray(Image.fromarray(a, "RGBA").rotate(-css_deg, resample=Image.BICUBIC, expand=True))


def crop_alpha(a: np.ndarray, pad=1) -> np.ndarray:
    ys, xs = np.where(a[..., 3] > 6)
    return a[max(0, ys.min() - pad):ys.max() + pad + 1, max(0, xs.min() - pad):xs.max() + pad + 1]


def upright(rgba: np.ndarray, css_deg: float):
    """
    Turns a photo piece by -css_deg and trims its transparent edge. Returns the
    image and the offset of its centre from the piece's original centre, already
    turned back into photo coordinates, so the landing spot stays exact.
    """
    r = rotate_rgba(rgba, -css_deg)
    ys, xs = np.where(r[..., 3] > 6)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    sx, sy = (x0 + x1) / 2 - r.shape[1] / 2, (y0 + y1) / 2 - r.shape[0] / 2
    t = math.radians(css_deg)
    shift = (sx * math.cos(t) - sy * math.sin(t), sx * math.sin(t) + sy * math.cos(t))
    return r[y0:y1, x0:x1].copy(), shift


SHADOW_PAD = 14


def with_shadow(rgba: np.ndarray, pad: int = SHADOW_PAD) -> np.ndarray:
    """
    Adds the piece's own soft contact shadow underneath it, inside an even
    margin so the image centre stays the piece centre. The shadow travels with
    the food and is identical in the animation and in the finished dish image.
    """
    h, w = rgba.shape[:2]
    out = np.zeros((h + 2 * pad, w + 2 * pad, 4), np.uint8)
    a = np.zeros(out.shape[:2], np.float32)
    a[pad + 4:pad + 4 + h, pad + 2:pad + 2 + w] = rgba[..., 3].astype(np.float32) / 255
    a = cv2.GaussianBlur(a, (0, 0), 4) * 0.42
    out[..., 3] = (a * 255).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    img.alpha_composite(Image.fromarray(rgba, "RGBA"), (pad, pad))
    return np.asarray(img)


def resize(a: np.ndarray, w: float, h: float) -> np.ndarray:
    return np.asarray(Image.fromarray(a, "RGBA").resize((max(1, round(w)), max(1, round(h))), Image.LANCZOS))


def save_webp(a: np.ndarray, path: Path, q=88):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(a, "RGBA").save(path, quality=q, method=6)


def rel(path: Path) -> str:
    return str(path.relative_to(PUB))


def skewer_metal(name: str):
    """Upright metal of a supplied skewer (tip, rod rebuilt through the meat, handle) and its meat rows."""
    img = crop_alpha(np.asarray(Image.open(SUP / f"{name}-skewer.png").convert("RGBA")).copy())
    alpha = img[..., 3].astype(np.float32) / 255
    width = (alpha > 0.5).sum(axis=1)
    rows = np.where(width > 0.55 * width.max())[0]
    m0, m1 = int(rows.min()), int(rows.max())
    # Keep a short grip below the meat: a full-length handle would reach past
    # the plate and over the dish names while it slides out.
    img = img[: m1 + int((img.shape[0] - m1) * HANDLE_KEEP)]
    alpha = img[..., 3].astype(np.float32) / 255
    band = (np.arange(img.shape[0]) >= m0 - 2) & (np.arange(img.shape[0]) <= m1 + 2)
    metal = img.copy()
    metal[band, :, 3] = 0
    strip = img[m1 + 8:m1 + 40].astype(np.float32)
    w = strip[..., 3:4]
    profile = (strip[..., :3] * w).sum(0) / np.maximum(w.sum(0), 1)
    metal[m0 - 6:m1 + 9, :, :3] = np.where(metal[m0 - 6:m1 + 9, :, 3:4] > 0, metal[m0 - 6:m1 + 9, :, :3], profile.astype(np.uint8))
    metal[m0 - 6:m1 + 9, :, 3] = np.maximum(metal[m0 - 6:m1 + 9, :, 3], strip[..., 3].mean(0).astype(np.uint8))
    axis_x = float((np.arange(img.shape[1]) * w[..., 0].sum(0)).sum() / w.sum())
    return metal, (m0, m1), axis_x


def plate_crop(rgb_full: np.ndarray):
    """Background removal for the dish photo; returns the crop box and alpha at PLATE_W."""
    from rembg import new_session, remove

    alpha = np.asarray(remove(Image.fromarray(rgb_full), session=new_session("isnet-general-use"), only_mask=True), np.float32) / 255
    alpha = np.clip((alpha - 0.1) / 0.8, 0, 1)
    ys, xs = np.where(alpha > 0.05)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    k = PLATE_W / (box[2] - box[0])
    h = round((box[3] - box[1]) * k)
    crop = lambda a, interp: cv2.resize(a[box[1]:box[3], box[0]:box[2]], (PLATE_W, h), interpolation=interp)
    return box, k, crop(rgb_full, cv2.INTER_AREA), crop(alpha, cv2.INTER_LINEAR)


def tawook_piece_masks(rgb_full: np.ndarray) -> list[np.ndarray]:
    """One SAM mask per chicken piece, from one point on each; overlaps go to the nearest point."""
    cache = HERE / ".cache" / "tawook-masks.npz"
    if cache.exists():
        data = np.load(cache)
        if list(map(tuple, data["points"])) == TAWOOK_POINTS:
            return list(data["masks"])
    from rembg import new_session, remove

    session = new_session("sam")
    img = Image.fromarray(rgb_full)
    masks = []
    for x, y in TAWOOK_POINTS:
        m = np.asarray(remove(img, session=session, only_mask=True, sam_prompt=[{"type": "point", "data": [x, y], "label": 1}])) > 128
        parts = keep_large(m, 500)
        # keep the part under the point
        m = next((p for p in parts if p[y, x]), max(parts, key=lambda p: p.sum()) if parts else m)
        masks.append(fill_holes(m))
    H, W = rgb_full.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    stack = np.stack(masks)
    owner = np.full((H, W), -1)
    best = np.full((H, W), np.inf)
    for i, (x, y) in enumerate(TAWOOK_POINTS):
        d = np.where(stack[i], (xx - x) ** 2 + (yy - y) ** 2, np.inf)
        take = d < best
        owner[take] = i
        best[take] = d[take]
    out = [owner == i for i in range(len(TAWOOK_POINTS))]
    cache.parent.mkdir(exist_ok=True)
    np.savez_compressed(cache, points=np.array(TAWOOK_POINTS), masks=np.array(out))
    return out


def plate_ellipse(rgb: np.ndarray) -> np.ndarray:
    """Inside of the plate, from an ellipse fitted to the visible dark ceramic."""
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    dark = ((hsv[..., 2] < 95) & (hsv[..., 1] < 110)).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    biggest = max(keep_large(dark, 1000), key=lambda c: c.sum()).astype(np.uint8)
    contour = max(cv2.findContours(biggest, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=len)
    m = np.zeros(rgb.shape[:2], np.uint8)
    cv2.ellipse(m, cv2.fitEllipse(cv2.convexHull(contour)), 1, -1)
    return m > 0


def clean_rice(rgb: np.ndarray, protein_hole: np.ndarray) -> np.ndarray:
    """
    The clean band of rice to the left of the kebabs in the kebab photo: grainy,
    strongly saturated rice only (pickles share the hue but are paler, and sit
    further right). Both dish photos come from the same shoot, so this rice is
    the texture used to rebuild what the protein hid on either plate.
    """
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    grain = (hsv[..., 0] >= 14) & (hsv[..., 0] <= 30) & (hsv[..., 1] > 215) & (hsv[..., 2] > 140)
    frac = cv2.GaussianBlur(grain.astype(np.float32), (0, 0), 6)
    H, W = grain.shape
    yy, xx = np.mgrid[0:H, 0:W]
    away = ~(cv2.dilate(protein_hole.astype(np.uint8), np.ones((41, 41), np.uint8)) > 0)
    return (frac > 0.4) & away & (xx < 0.42 * W) & (yy > 0.3 * H)


# ------------------------------------------------------------------- build
def build_dish(dish: str, rice_rgb: np.ndarray | None = None, rice_region: np.ndarray | None = None):
    rgb_full = np.asarray(Image.open(SUP / f"{dish}-dish.webp").convert("RGB")).copy()
    box, k, rgb, alpha = plate_crop(rgb_full)
    to_crop = lambda x, y: ((x - box[0]) * k, (y - box[1]) * k)

    if dish == "kebab":
        caps = [(to_crop(*p), to_crop(*q), r * k) for p, q, r in KEBABS]
        masks = kebab_masks(rgb, caps)
        masks[1] = masks[1] & ~masks[0]
    else:
        full_masks = tawook_piece_masks(rgb_full)
        masks = []
        for m in full_masks:
            mc = cv2.resize(m[box[1]:box[3], box[0]:box[2]].astype(np.uint8), (PLATE_W, rgb.shape[0]), interpolation=cv2.INTER_NEAREST) > 0
            masks.append(fill_holes(cv2.morphologyEx(mc.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0))

    hole = np.zeros(rgb.shape[:2], bool)
    for m in masks:
        hole |= m
    hole = cv2.dilate(hole.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))) > 0
    plate = plate_ellipse(rgb)
    # Protein hanging over the rim: beyond the plate there is only background, so it goes transparent.
    outside = hole & ~plate
    if rice_region is None:  # the kebab photo supplies its own clean rice
        rice_rgb, rice_region = rgb, clean_rice(rgb, hole)
    base_rgb = quilt_fill(rgb, hole & plate, rice_region, source_rgb=rice_rgb)
    base_alpha = alpha.copy()
    base_alpha[outside] = 0
    base_alpha = np.minimum(base_alpha, cv2.GaussianBlur(np.where(outside, 0.0, 1.0).astype(np.float32), (0, 0), 1.2))
    base = np.dstack([base_rgb, (base_alpha * 255).astype(np.uint8)])
    a8 = (alpha * 255).astype(np.uint8)

    pieces = []
    for i, m in enumerate(masks):
        a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.0)
        ys, xs = np.where(a > 0.02)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        rgba = np.dstack([rgb, (a * 255).astype(np.uint8)])[y0:y1, x0:x1].copy()
        pieces.append({"rgba": rgba, "center": ((x0 + x1) / 2, (y0 + y1) / 2), "index": i})
    return {"base": base, "reference": np.dstack([rgb, a8]), "pieces": pieces, "size": (PLATE_W, rgb.shape[0]),
            "rgb": rgb, "rice": rice_region}


def kebab_mover(piece: dict, metal_src):
    """Upright kebab: the photo's kebab turned upright on the real kebab skewer metal."""
    p, q, _ = KEBABS[piece["index"]]
    rot = css_angle(p, q)            # tip (upper-left end) → handle (lower-right end)
    meat, shift = upright(piece["rgba"], rot)
    metal, (m0, m1), axis_x = metal_src
    s = meat.shape[0] / (m1 - m0)
    metal = resize(metal, metal.shape[1] * s, metal.shape[0] * s)
    axis_x *= s
    mw = max(metal.shape[1], meat.shape[1] + 20)
    canvas_w, canvas_h = mw, metal.shape[0]
    mx = (mw - metal.shape[1]) / 2
    metal_canvas = np.zeros((canvas_h, canvas_w, 4), np.uint8)
    metal_canvas[:, round(mx):round(mx) + metal.shape[1]] = metal
    rod_x = mx + axis_x
    rect = [rod_x - meat.shape[1] / 2, m0 * s, meat.shape[1], meat.shape[0]]
    # The piece's own rotation inside the canvas is 0; it keeps the skewer's rotation.
    # Landing rotation rot turns the upright meat back to how it lies in the photo.
    final = (piece["center"][0] + shift[0], piece["center"][1] + shift[1])
    return metal_canvas, meat, rect, rot, final


def tawook_movers(pieces: list[dict], metal_src):
    """Two skewers of five photo pieces each; pieces fan out to their photo spots after landing."""
    centres = np.array([p["center"] for p in pieces])
    mean = centres.mean(0)
    _, vecs = np.linalg.eigh(np.cov((centres - mean).T))
    minor = vecs[:, 0]
    side = (centres - mean) @ minor
    order = np.argsort(side)
    groups = [sorted(order[:5].tolist()), sorted(order[5:].tolist())]
    out = []
    metal, (m0, m1), axis_x = metal_src
    for g in groups:
        pts = centres[g]
        gm = pts.mean(0)
        _, v = np.linalg.eigh(np.cov((pts - gm).T))
        major = v[:, 1]
        if major[1] < 0:
            major = -major              # handle end down
        rot = math.degrees(math.atan2(-major[0], major[1]))
        # stack pieces along the rod in the order they lie along the major axis
        along = (pts - gm) @ major
        seq = [g[i] for i in np.argsort(along)]
        turned = [upright(pieces[i]["rgba"], rot) for i in seq]
        imgs = [im for im, _ in turned]
        finals = [(pieces[i]["center"][0] + sh[0], pieces[i]["center"][1] + sh[1]) for i, (_, sh) in zip(seq, turned)]
        heights = [im.shape[0] for im in imgs]
        meat_len = sum(heights) * 0.86
        s = meat_len / (m1 - m0)
        mt = resize(metal, metal.shape[1] * s, metal.shape[0] * s)
        ax = axis_x * s
        cw = max(mt.shape[1], max(im.shape[1] for im in imgs) + 20)
        mx = (cw - mt.shape[1]) / 2
        canvas = np.zeros((mt.shape[0], cw, 4), np.uint8)
        canvas[:, round(mx):round(mx) + mt.shape[1]] = mt
        rod_x = mx + ax
        y = m0 * s
        rects = []
        for im in imgs:
            rects.append([rod_x - im.shape[1] / 2, y, im.shape[1], im.shape[0]])
            y += im.shape[0] * 0.86
        out.append({"canvas": canvas, "rot": rot, "pieces": list(zip(finals, imgs, rects))})
    return out


def main():
    food_dir = ASSETS / "food"
    plates_dir = ASSETS / "plates"
    layout_path = CONFIG / "grill-items.json"
    grill = json.loads(layout_path.read_text())
    grill["items"] = {k: v for k, v in grill["items"].items() if k.startswith("basket")}
    food = {"plates": {}, "movers": {}}

    kebab = build_dish("kebab")
    tawook = build_dish("tawook", kebab["rgb"], kebab["rice"])
    kebab_metal = skewer_metal("kebab")
    tawook_metal = skewer_metal("tawook")

    def place_on_grill(item_id: str, canvas_w: float, canvas_h: float):
        tip, end = SLOTS[item_id]
        length = math.dist(tip, end)
        s = length / canvas_h
        cx, cy = (tip[0] + end[0]) / 2, (tip[1] + end[1]) / 2
        w, h = canvas_w * s, canvas_h * s
        grill["items"][item_id] = {
            "box": [round(cx - w / 2, 2), round(cy - h / 2, 2), round(cx + w / 2, 2), round(cy + h / 2, 2)],
            "axis": round(css_angle(tip, end), 2),
        }

    def save_mover(item_id, dish, canvas, rot, parts):
        metal_path = food_dir / f"{item_id}-metal.webp"
        save_webp(canvas, metal_path)
        entries = []
        for j, (final, img, rect, final_rot) in enumerate(parts):
            path = food_dir / f"{item_id}-piece-{j + 1}.webp"
            save_webp(with_shadow(img), path)
            pad = SHADOW_PAD
            rect = [rect[0] - pad, rect[1] - pad, rect[2] + 2 * pad, rect[3] + 2 * pad]
            entries.append({
                "src": rel(path),
                "rect": [round(v, 2) for v in rect],
                "final": [round(final[0], 2), round(final[1], 2)],
                "finalRotation": round(final_rot, 2),
            })
        food["movers"][item_id] = {
            "dish": dish,
            "canvas": [canvas.shape[1], canvas.shape[0]],
            "metal": rel(metal_path),
            "rotation": round(rot, 2),
            "pieces": entries,
        }
        place_on_grill(item_id, canvas.shape[1], canvas.shape[0])

    # Kebabs: front (lower) kebab to the left-hand skewer of the pair, so paths never cross.
    for item_id, piece in (("kebab-3", kebab["pieces"][0]), ("kebab-4", kebab["pieces"][1])):
        canvas, meat, rect, rot, final = kebab_mover(piece, kebab_metal)
        save_mover(item_id, "kebab", canvas, rot, [(final, meat, rect, rot)])
    # Kebabs that stay on the grill: the same two kebabs, mirrored, as one image each.
    for item_id, piece in (("kebab-1", kebab["pieces"][1]), ("kebab-2", kebab["pieces"][0])):
        canvas, meat, rect, _, _ = kebab_mover(piece, kebab_metal)
        fi = Image.new("RGBA", (canvas.shape[1], canvas.shape[0]), (0, 0, 0, 0))
        fi.alpha_composite(Image.fromarray(with_shadow(meat[:, ::-1].copy()), "RGBA"), (round(rect[0]) - SHADOW_PAD, round(rect[1]) - SHADOW_PAD))
        save_webp(canvas, food_dir / f"{item_id}-metal.webp")
        save_webp(np.asarray(fi), food_dir / f"{item_id}-food.webp")
        place_on_grill(item_id, canvas.shape[1], canvas.shape[0])

    # Tawook: two moving skewers built from the ten pieces, and one that stays.
    skewers = tawook_movers(tawook["pieces"], tawook_metal)
    for item_id, sk in zip(("tawook-2", "tawook-3"), skewers):
        parts = [(final, img, rect, sk["rot"]) for final, img, rect in sk["pieces"]]
        save_mover(item_id, "tawook", sk["canvas"], sk["rot"], parts)
    sk = skewers[0]
    fi = Image.new("RGBA", (sk["canvas"].shape[1], sk["canvas"].shape[0]), (0, 0, 0, 0))
    for _, img, rect in sk["pieces"]:
        fi.alpha_composite(Image.fromarray(with_shadow(img[:, ::-1].copy()), "RGBA"), (round(rect[0]) - SHADOW_PAD, round(rect[1]) - SHADOW_PAD))
    save_webp(sk["canvas"], food_dir / "tawook-1-metal.webp")
    save_webp(np.asarray(fi), food_dir / "tawook-1-food.webp")
    place_on_grill("tawook-1", sk["canvas"].shape[1], sk["canvas"].shape[0])

    # Half chicken: the isolated photo, landing on the kebab plate's base.
    chicken = with_shadow(crop_alpha(np.asarray(Image.open(SUP / "half-chicken.png").convert("RGBA")).copy()), 40)
    cpath = food_dir / "chicken-piece-1.webp"
    save_webp(chicken, cpath)
    pw, ph = kebab["size"]
    cw = CHICKEN_ON_PLATE["width"] * pw
    scale = cw / chicken.shape[1]
    ccx = pw / 2 + CHICKEN_ON_PLATE["x"] * pw
    ccy = ph / 2 + CHICKEN_ON_PLATE["y"] * pw
    food["movers"]["chicken"] = {
        "dish": "chicken",
        "canvas": [chicken.shape[1], chicken.shape[0]],
        "metal": None,
        "rotation": CHICKEN_ON_PLATE["rotation"],
        "plateScale": round(scale, 5),
        "pieces": [{"src": rel(cpath), "rect": [0, 0, chicken.shape[1], chicken.shape[0]],
                    "final": [round(ccx, 2), round(ccy, 2)], "finalRotation": CHICKEN_ON_PLATE["rotation"]}],
    }
    s = CHICKEN_WIDTH / chicken.shape[1]
    cx, cy = CHICKEN_CENTER
    w, h = chicken.shape[1] * s, chicken.shape[0] * s
    grill["items"]["chicken"] = {"box": [round(cx - w / 2, 2), round(cy - h / 2, 2), round(cx + w / 2, 2), round(cy + h / 2, 2)], "axis": CHICKEN_ROTATION}

    # Plates: the base (protein removed) and the untouched photo for owner-mode comparison.
    def finish(dish, base, reference):
        save_webp(base, plates_dir / f"{dish}-base.webp")
        save_webp(reference, plates_dir / f"{dish}-reference.webp")
        food["plates"][dish] = {
            "size": [base.shape[1], base.shape[0]],
            "base": f"assets/plates/{dish}-base.webp",
            "reference": f"assets/plates/{dish}-reference.webp",
        }

    finish("kebab", kebab["base"], kebab["reference"])
    finish("tawook", tawook["base"], tawook["reference"])
    finish("chicken", kebab["base"], kebab["reference"])

    layout_path.write_text(json.dumps(grill, indent=2) + "\n")
    (CONFIG / "food-layout.json").write_text(json.dumps(food, indent=2) + "\n")
    print("done")


if __name__ == "__main__":
    main()
