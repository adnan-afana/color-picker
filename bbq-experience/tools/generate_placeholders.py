"""
Procedural placeholder renderer for the BBQ prototype.

Produces shaded, photo-styled stand-ins for the empty serving plates:
  public/assets/plates/{beef,tawook,chicken}-empty.png   (transparent)

Replace any of these files with real photography (same file name) and the
site picks them up without code changes.

Run:  python3 tools/generate_placeholders.py
Needs: numpy, pillow, scipy
"""
from __future__ import annotations

import math
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent.parent / "public" / "assets"
LIGHT = np.array([-0.45, -0.55, 0.70])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


# ---------------------------------------------------------------- utilities
def value_noise(w: int, h: int, cells: float, rng: np.random.Generator) -> np.ndarray:
    gw, gh = max(2, int(w / cells) + 2), max(2, int(h / cells) + 2)
    grid = rng.random((gh, gw)).astype(np.float32)
    img = Image.fromarray((grid * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255.0


def fbm(w: int, h: int, base: float, rng, octaves: int = 4) -> np.ndarray:
    out = np.zeros((h, w), np.float32)
    amp, total, cells = 1.0, 0.0, base
    for _ in range(octaves):
        out += value_noise(w, h, cells, rng) * amp
        total += amp
        amp *= 0.5
        cells = max(1.5, cells / 2)
    return out / total


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def shade(height: np.ndarray, albedo: np.ndarray, strength=1.0, spec=0.25,
          shininess=24, bounce=(1.0, 0.45, 0.15), bounce_amt=0.18, ambient=0.28):
    gy, gx = np.gradient(height * strength)
    n = np.dstack([-gx, -gy, np.ones_like(height)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    diff = np.clip((n * LIGHT).sum(2), 0, 1)
    half = LIGHT + np.array([0, 0, 1.0])
    half /= np.linalg.norm(half)
    sp = np.clip((n * half).sum(2), 0, 1) ** shininess * spec
    # warm bounce light from below (charcoal glow)
    b = np.clip(n[..., 1], 0, 1) * bounce_amt
    col = albedo * (ambient + diff[..., None] * 0.85)
    col += np.array(bounce)[None, None, :] * b[..., None] * albedo * 1.4
    col += sp[..., None]
    return np.clip(col, 0, 1)


def to_rgba(rgb: np.ndarray, alpha: np.ndarray) -> Image.Image:
    arr = np.dstack([np.clip(rgb, 0, 1), np.clip(alpha, 0, 1)])
    return Image.fromarray((arr * 255).astype(np.uint8), "RGBA")


def soft_shadow(img: Image.Image, blur: float, opacity: float, offset=(0, 0)) -> Image.Image:
    a = np.asarray(img.split()[3], np.float32) / 255 * opacity
    sh = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    black = Image.new("RGBA", img.size, (12, 6, 3, 255))
    out.paste(black, offset, sh)
    return out


# ------------------------------------------------------------- meat chunks
MEATS = {
    # base albedo, browning colour, char colour, size, roundness
    "beef": dict(base=(0.42, 0.17, 0.10), brown=(0.24, 0.10, 0.06), char=(0.06, 0.03, 0.02),
                 sheen=0.32, p=3.2, w=(150, 175), h=(130, 150)),
    "tawook": dict(base=(0.86, 0.55, 0.24), brown=(0.62, 0.32, 0.12), char=(0.18, 0.08, 0.03),
                   sheen=0.28, p=3.6, w=(140, 165), h=(120, 140)),
    "chicken": dict(base=(0.80, 0.50, 0.22), brown=(0.52, 0.25, 0.09), char=(0.14, 0.06, 0.02),
                    sheen=0.45, p=2.4, w=(185, 225), h=(140, 165)),
    "onion": dict(base=(0.86, 0.76, 0.64), brown=(0.55, 0.36, 0.20), char=(0.20, 0.11, 0.06),
                  sheen=0.5, p=2.6, w=(70, 90), h=(120, 135)),
    "pepper": dict(base=(0.20, 0.42, 0.10), brown=(0.12, 0.25, 0.06), char=(0.05, 0.06, 0.02),
                   sheen=0.7, p=3.0, w=(60, 75), h=(125, 140)),
    "tomato": dict(base=(0.72, 0.12, 0.06), brown=(0.45, 0.07, 0.04), char=(0.10, 0.03, 0.02),
                   sheen=0.8, p=2.0, w=(150, 165), h=(150, 165)),
}


def render_chunk(kind: str, rng: np.random.Generator, scale: float = 1.0,
                 grill_marks=True) -> Image.Image:
    m = MEATS[kind]
    w = int(rng.uniform(*m["w"]) * scale)
    h = int(rng.uniform(*m["h"]) * scale)
    pad = 12
    W, H = w + pad * 2, h + pad * 2
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    x = (xx - W / 2) / (w / 2)
    y = (yy - H / 2) / (h / 2)
    p = m["p"]
    d = (np.abs(x) ** p + np.abs(y) ** p) ** (1 / p)
    theta = np.arctan2(y, x)
    r = np.ones_like(d)
    for k in range(2, 7):
        r += rng.uniform(-0.035, 0.035) * np.sin(k * theta + rng.uniform(0, 6.28))
    r += (fbm(W, H, 18, rng) - 0.5) * 0.16
    edge = r - d
    alpha = smoothstep(0.0, 2.2 / (w / 2), edge)
    body = np.clip(edge / 0.55, 0, 1)
    height = np.sqrt(body) * (w * 0.22)
    rough = fbm(W, H, 10, rng, 5)
    fibre = fbm(W, H, 4, rng, 3)
    height += (rough - 0.5) * 9 + (fibre - 0.5) * 3

    base = np.array(m["base"])[None, None, :]
    brown = np.array(m["brown"])[None, None, :]
    char = np.array(m["char"])[None, None, :]
    var = fbm(W, H, 14, rng)
    alb = base * (0.8 + var[..., None] * 0.45)
    edge_brown = 1 - smoothstep(0.0, 0.5, body)
    alb = alb * (1 - edge_brown[..., None] * 0.75) + brown * edge_brown[..., None] * 0.75
    if grill_marks and kind not in ("onion", "pepper"):
        ang = rng.uniform(0.55, 0.95)
        u = xx * math.cos(ang) + yy * math.sin(ang)
        period = rng.uniform(34, 44) * scale
        stripe = np.cos((u / period) * 2 * math.pi + rng.uniform(0, 6))
        mark = smoothstep(0.55, 0.9, stripe) * smoothstep(0.25, 0.75, fbm(W, H, 9, rng))
        alb = alb * (1 - mark[..., None] * 0.85) + char * mark[..., None] * 0.85
        height -= mark * 3
    speck = smoothstep(0.66, 0.8, fbm(W, H, 5, rng, 3)) * (0.4 + edge_brown * 0.6)
    alb = alb * (1 - speck[..., None] * 0.8) + char * speck[..., None] * 0.8
    if kind == "onion":
        rings = 0.5 + 0.5 * np.cos(x * 9)
        alb *= (0.85 + rings[..., None] * 0.2)
    rgb = shade(height, alb, strength=1.0, spec=m["sheen"], shininess=30)
    return to_rgba(rgb, alpha)


# ----------------------------------------------------------------- skewer
def render_rod(length: int, thick: int) -> Image.Image:
    H = thick * 4
    img = np.zeros((H, length, 4), np.float32)
    yy, xx = np.mgrid[0:H, 0:length].astype(np.float32)
    cy = H / 2
    t = np.abs(yy - cy) / (thick / 2)
    # pointed tip on right
    tip = 60
    taper = np.clip((length - xx) / tip, 0, 1)
    half = taper
    inside = t < half
    prof = np.clip(1 - (t / np.maximum(half, 1e-3)) ** 2, 0, 1)
    g = 0.35 + 0.55 * np.cos((yy - cy) / (thick / 2) * 1.2 + 0.6) ** 2
    rgb = np.dstack([g * 0.86, g * 0.84, g * 0.82]) * (0.6 + 0.4 * prof[..., None])
    a = np.where(inside, smoothstep(0, 0.12, half - t), 0)
    img[..., :3] = rgb
    img[..., 3] = a
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), "RGBA")


def render_handle(rng, w=230, h=58) -> Image.Image:
    W, H = w, h
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    x = (xx - W / 2) / (W / 2)
    y = (yy - H / 2) / (H / 2)
    d = (np.abs(x) ** 6 + np.abs(y) ** 2.2) ** (1 / 2.2)
    alpha = smoothstep(0, 0.04, 1 - d)
    body = np.clip(1 - np.abs(y), 0, 1)
    height = np.sqrt(body) * 22
    grain = fbm(W, H, 6, rng, 3)
    streak = 0.5 + 0.5 * np.sin(yy * 0.9 + grain * 9)
    alb = np.dstack([0.33 + streak * 0.1, 0.19 + streak * 0.06, 0.10 + streak * 0.03])
    rgb = shade(height + grain * 3, alb, spec=0.35, shininess=40, bounce_amt=0.1)
    return to_rgba(rgb, alpha)


SKEWERS = {
    "beef": ["beef", "onion", "beef", "beef", "onion", "beef", "beef"],
    "tawook": ["tawook", "pepper", "tawook", "tawook", "tawook", "pepper", "tawook"],
    "chicken": ["chicken", "chicken", "chicken", "chicken", "chicken"],
}


def render_skewer(name: str, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    W, H = 1800, 300
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cy = H // 2
    rod = render_rod(1560, 12)
    canvas.alpha_composite(rod, (200, cy - rod.height // 2))
    handle = render_handle(rng)
    canvas.alpha_composite(handle, (20, cy - handle.height // 2))
    # metal collar
    collar = render_rod(30, 30)
    canvas.alpha_composite(collar.crop((0, 0, 24, collar.height)), (240, cy - collar.height // 2))

    seq = SKEWERS[name]
    x = 330
    for kind in seq:
        chunk = render_chunk(kind, rng)
        chunk = chunk.rotate(rng.uniform(-9, 9), resample=Image.BICUBIC, expand=True)
        cx = x
        cyj = cy - chunk.height // 2 + int(rng.uniform(-8, 8))
        shadow = soft_shadow(chunk, 10, 0.7, (14, 10))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        layer.alpha_composite(shadow, (cx, cyj))
        canvas = Image.alpha_composite(canvas, layer)
        canvas.alpha_composite(chunk, (cx, cyj))
        x += chunk.width - int(rng.uniform(26, 40))
    # trim to content
    bbox = canvas.getbbox()
    return canvas.crop((0, max(0, bbox[1] - 6), W, min(H, bbox[3] + 6)))


# ------------------------------------------------------------------ plates
PLATES = {
    "beef": dict(color=(0.16, 0.15, 0.14), rim=(0.22, 0.21, 0.2), spec=0.35),     # slate stoneware
    "tawook": dict(color=(0.93, 0.91, 0.87), rim=(0.97, 0.96, 0.93), spec=0.6),   # white porcelain
    "chicken": dict(color=(0.55, 0.30, 0.18), rim=(0.62, 0.36, 0.22), spec=0.4),  # terracotta
}


def render_plate(name: str, seed: int, size=1000) -> Image.Image:
    rng = np.random.default_rng(seed)
    cfg = PLATES[name]
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    c = size / 2
    r = np.hypot(xx - c, yy - c) / (size * 0.47)
    alpha = smoothstep(1.0, 0.993, r)
    # profile: flat well, raised rim, rolled lip
    well = 0.62
    height = np.where(r < well, 0, smoothstep(well, 0.86, r) * 26)
    height += np.where(r > 0.86, (1 - smoothstep(0.86, 1.0, r)) * 26 + 4 * np.sin((r - 0.86) / 0.14 * math.pi), 0)
    height += (fbm(size, size, 30, rng) - 0.5) * 1.2
    tone = np.array(cfg["color"])
    rimc = np.array(cfg["rim"])
    mix = smoothstep(well, 0.9, r)[..., None]
    speck = fbm(size, size, 3, rng, 2)
    alb = tone * (1 - mix) + rimc * mix
    alb = alb * (0.94 + speck[..., None] * 0.1)
    rgb = shade(height, alb, strength=0.6, spec=cfg["spec"], shininess=60, bounce_amt=0.05, ambient=0.5)
    # soft inner shadow under rim
    rgb *= (1 - (smoothstep(well - 0.05, well + 0.04, r) * (1 - smoothstep(well + 0.04, well + 0.2, r)) * 0.12))[..., None]
    plate = to_rgba(rgb, alpha)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(soft_shadow(plate, 22, 0.55, (18, 26)))
    out.alpha_composite(plate)
    return out


def herb_flecks(size, rng, count=140, area=0.3):
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for _ in range(count):
        s = int(rng.uniform(10, 22))
        yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
        d = np.hypot(xx - s / 2, yy - s / 2) / (s / 2)
        a = smoothstep(1, 0.7, d + (rng.random((s, s)) - 0.5) * 0.5)
        g = rng.uniform(0.25, 0.45)
        rgb = np.dstack([np.full((s, s), g * 0.35), np.full((s, s), g), np.full((s, s), g * 0.2)])
        fl = to_rgba(rgb, a)
        ang, rad = rng.uniform(0, 6.28), math.sqrt(rng.random()) * size * area
        layer.alpha_composite(fl, (int(size / 2 + math.cos(ang) * rad), int(size / 2 + math.sin(ang) * rad)))
    return layer


def render_lemon(rng, s=170) -> Image.Image:
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    x = (xx - s / 2) / (s / 2)
    y = (yy - s * 0.25) / (s * 0.75)
    r = np.hypot(x, y)
    alpha = smoothstep(1, 0.97, r) * smoothstep(-0.02, 0.02, y)
    seg = 0.5 + 0.5 * np.cos(np.arctan2(y, x) * 14)
    pulp = np.dstack([0.98 - seg * 0.05, 0.86 - seg * 0.08, 0.32 + seg * 0.05])
    rind = smoothstep(0.86, 0.9, r)[..., None]
    pith = smoothstep(0.8, 0.84, r)[..., None] * (1 - rind)
    alb = pulp * (1 - rind - pith) + np.array([0.95, 0.78, 0.12]) * rind + np.array([0.97, 0.95, 0.85]) * pith
    height = (1 - r) * 18 + seg * 1.5
    return to_rgba(shade(height, alb, spec=0.6, shininess=40, ambient=0.45), alpha)


def render_dish(name: str, seed: int, size=1000) -> Image.Image:
    rng = np.random.default_rng(seed)
    dish = render_plate(name, seed)
    food = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    c = size // 2
    pieces = [k for k in SKEWERS[name]]
    rng.shuffle(pieces)
    # optional flatbread base for beef / tawook
    if False:
        bread = render_chunk("onion", rng, scale=3.4, grill_marks=False)
        arr = np.asarray(bread).astype(np.float32) / 255
        arr[..., 0] = arr[..., 0] * 1.05
        arr[..., 2] = arr[..., 2] * 0.7
        bread = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGBA")
        bread = bread.rotate(rng.uniform(0, 360), expand=True, resample=Image.BICUBIC)
        food.alpha_composite(bread, (c - bread.width // 2 - 40, c - bread.height // 2 + 10))
    # arrange the meat in a gentle arc (as if slid off a skewer)
    n = len(pieces)
    for i, kind in enumerate(pieces + [SKEWERS[name][0]] * 1):
        t = i / max(1, n)
        ang = -2.3 + t * 2.4
        rad = size * 0.17
        px = c + math.cos(ang) * rad * 1.35 - 10
        py = c + math.sin(ang) * rad + 70
        ch = render_chunk(kind, rng, scale=1.25)
        ch = ch.rotate(rng.uniform(0, 360), expand=True, resample=Image.BICUBIC)
        food.alpha_composite(soft_shadow(ch, 9, 0.75, (10, 12)), (int(px - ch.width / 2), int(py - ch.height / 2)))
        food.alpha_composite(ch, (int(px - ch.width / 2), int(py - ch.height / 2)))
    # grilled tomato + lemon garnish
    tom = render_chunk("tomato", rng, scale=0.95)
    food.alpha_composite(soft_shadow(tom, 9, 0.7, (10, 12)), (c + 120, c + 110))
    food.alpha_composite(tom, (c + 120, c + 110))
    lem = render_lemon(rng).rotate(rng.uniform(-40, 40), expand=True, resample=Image.BICUBIC)
    food.alpha_composite(soft_shadow(lem, 8, 0.6, (8, 10)), (c - 300, c + 120))
    food.alpha_composite(lem, (c - 300, c + 120))
    food.alpha_composite(herb_flecks(size, rng))
    dish.alpha_composite(food)
    return dish


# ------------------------------------------------------------------- grill
def render_grill(seed=7, W=2400, H=1350) -> Image.Image:
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # dark smoky backdrop
    bg = np.dstack([np.full((H, W), 0.035), np.full((H, W), 0.025), np.full((H, W), 0.02)])
    glow = np.exp(-(((xx - W / 2) / (W * 0.45)) ** 2 + ((yy - H * 0.62) / (H * 0.45)) ** 2))
    bg += glow[..., None] * np.array([0.30, 0.11, 0.03])
    smoke = fbm(W, H, 140, rng, 5)
    bg += (smoke[..., None] * 0.06) * (1 - yy / H)[..., None]

    # grill box
    x0, x1, y0, y1 = 180, W - 180, 250, H - 90
    inner = (xx > x0 + 50) & (xx < x1 - 50) & (yy > y0 + 45) & (yy < y1 - 70)
    box = (xx > x0) & (xx < x1) & (yy > y0) & (yy < y1)

    # coal bed via voronoi
    pts = np.column_stack([rng.uniform(x0, x1, 900), rng.uniform(y0, y1, 900)])
    tree = cKDTree(pts)
    sub = 2
    sy, sx = np.mgrid[0:H:sub, 0:W:sub].astype(np.float32)
    dd, ii = tree.query(np.column_stack([sx.ravel(), sy.ravel()]), k=2)
    d1 = dd[:, 0].reshape(sx.shape)
    d2 = dd[:, 1].reshape(sx.shape)
    idx = ii[:, 0].reshape(sx.shape)
    edge_sm = np.clip((d2 - d1) / 26, 0, 1)
    heat_cell = rng.random(len(pts))[idx]

    def up(a):
        return np.asarray(Image.fromarray(a.astype(np.float32), "F").resize((W, H), Image.BILINEAR))

    edge = up(edge_sm)
    heat = up(heat_cell)
    lump = np.sqrt(edge)
    n1 = fbm(W, H, 12, rng, 4)
    hot = np.clip(heat * 0.9 + (n1 - 0.5) * 0.6, 0, 1)
    # glow in cracks between coals; tops of coals are ashy/black
    crack = (1 - edge) ** 4
    zones = smoothstep(0.35, 0.75, fbm(W, H, 260, rng, 3))
    center_heat = np.exp(-(((xx - W / 2) / (W * 0.36)) ** 2 + ((yy - H * 0.6) / (H * 0.32)) ** 2))
    heatmap = np.clip(zones * 0.8 + center_heat * 0.5, 0, 1.2)
    ember = smoothstep(0.6, 0.95, hot) * lump * smoothstep(0.45, 0.7, n1)
    emiss = (crack * (0.35 + hot * 0.9) + ember * 0.55) * heatmap * 1.05
    ash = smoothstep(0.42, 0.72, fbm(W, H, 16, rng, 4)) * lump * (1 - zones * 0.5)
    coal_alb = np.dstack([0.04 + ash * 0.42, 0.037 + ash * 0.40, 0.035 + ash * 0.38])
    coal = shade(lump * 20 + n1 * 6, coal_alb, spec=0.12, shininess=12, bounce_amt=0.0, ambient=0.4)

    def ramp(e):
        e = np.clip(e, 0, 1.6)
        r = np.clip(e * 1.6, 0, 1)
        g = np.clip((e - 0.35) * 1.15, 0, 1) * 0.75
        b = np.clip((e - 0.95) * 1.2, 0, 1) * 0.5
        return np.dstack([r, g, b])

    coal = coal * (1 + ramp(emiss) * 1.5) + ramp(emiss) * 0.75

    img = bg.copy()
    # grill box walls: dark steel with warm inner reflection
    steel_n = fbm(W, H, 8, rng, 3)
    wall = np.dstack([0.08 + steel_n * 0.04] * 3)
    lip_light = smoothstep(y1 - 70, y1 - 10, yy) * box
    wall = wall + lip_light[..., None] * np.array([0.05, 0.04, 0.035])
    # inner warm light on inner walls
    inner_glow = box & ~inner
    wall = wall + (inner_glow * np.exp(-((yy - (y0 + 45)) / 40) ** 2))[..., None] * np.array([0.35, 0.12, 0.03])
    img = np.where(box[..., None], wall, img)
    img = np.where(inner[..., None], coal, img)
    # rim highlight
    rim = box & ((np.abs(yy - y0) < 6) | (np.abs(xx - x0) < 5) | (np.abs(xx - x1) < 5))
    img = np.where(rim[..., None], img + 0.12, img)

    # grate bars (vertical) + two cross rails
    bar_w = 20
    pitch = 96
    ux = (xx - (x0 + 60)) % pitch
    bars = inner & (ux < bar_w)
    bp = np.cos((ux - bar_w / 2) / bar_w * math.pi)
    bar_col = np.dstack([0.05 + bp * 0.07, 0.045 + bp * 0.05, 0.04 + bp * 0.04])
    bar_col += (np.clip(1 - bp, 0, 1) * 0.5)[..., None] * np.array([0.6, 0.22, 0.05]) * (0.4 + center_heat[..., None])
    # bar shadow on coals
    shadow = inner & (ux >= bar_w) & (ux < bar_w + 10)
    img = np.where(shadow[..., None], img * 0.55, img)
    img = np.where(bars[..., None], bar_col, img)
    for ry in (y0 + 160, y1 - 210):
        rail = inner & (np.abs(yy - ry) < 9)
        rp = np.cos((yy - ry) / 9 * math.pi / 2)
        rail_col = np.dstack([0.07 + rp * 0.1, 0.06 + rp * 0.07, 0.05 + rp * 0.05])
        img = np.where(rail[..., None], rail_col, img)

    # bloom
    bright = np.clip(img - 0.55, 0, 1)
    bimg = Image.fromarray((np.clip(bright, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(40))
    img = img + np.asarray(bimg, np.float32) / 255 * 0.9
    # heat haze / smoke wisps above grill
    wisp = fbm(W, H, 90, rng, 5)
    wisp = smoothstep(0.55, 0.85, wisp) * (1 - smoothstep(0, H * 0.7, yy)) * 0.08
    img += wisp[..., None]
    # vignette + grain
    v = 1 - 0.65 * (((xx - W / 2) / (W * 0.7)) ** 2 + ((yy - H / 2) / (H * 0.8)) ** 2)
    img *= np.clip(v, 0.2, 1)[..., None]
    img += (rng.random((H, W, 1)) - 0.5) * 0.025
    return Image.fromarray((np.clip(img, 0, 1) ** 0.95 * 255).astype(np.uint8), "RGB")


def main():
    # Only the empty serving plates are still placeholders; the food comes
    # from the approved composite (see prepare_grill_items.py).
    (ROOT / "plates").mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(["beef", "tawook", "chicken"]):
        render_plate(name, 200 + i).resize((800, 800), Image.LANCZOS).save(ROOT / "plates" / f"{name}-empty.png", optimize=True)
    print("done →", ROOT / "plates")


if __name__ == "__main__":
    main()
