"""
Wire grilling basket, modelled as a grid inside a perspective quad fitted to
the approved composite. Used to draw clean lid/base layers and to locate the
real wires so they can be removed from the chicken.
"""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

# Frame corners in the 1672 × 941 composite.
TL, TR, BR, BL = (327, 252), (596, 264), (510, 616), (148, 577)
CROSS_WIRES = 13               # transverse wires between the frame ends
# The two long rods run straight from the far end of the frame to the handle loop.
RODS = (((412, 243), (168, 710)), ((486, 246), (273, 719)))
HANDLE_LOOP = ((168, 710), (273, 719))


def _cross_bottom(p, q):
    """Where the segment p→q crosses the near edge of the frame (BL→BR)."""
    (x1, y1), (x2, y2) = p, q
    (x3, y3), (x4, y4) = BL, BR
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))


def quad(u: float, v: float):
    top = np.add(np.multiply(TL, 1 - u), np.multiply(TR, u))
    bot = np.add(np.multiply(BL, 1 - u), np.multiply(BR, u))
    return tuple(np.add(top * (1 - v), bot * v))


def polylines(part: str):
    """Lines for 'lid' (grid + frame) or 'base' (grid + frame + handle)."""
    lines = []
    frame = [quad(0, 0), quad(1, 0), quad(1, 1), quad(0, 1), quad(0, 0)]
    lines.append(frame)
    for i in range(1, CROSS_WIRES + 1):
        v = i / (CROSS_WIRES + 1)
        lines.append([quad(0, v), quad(1, v)])
    for top, end in RODS:
        lines.append([top, _cross_bottom(top, end)])
    if part == "base":
        for top, end in RODS:
            lines.append([_cross_bottom(top, end), end])
        lines.append(list(HANDLE_LOOP))
    return lines


def render(part: str, size=(1672, 941), width=4.6, ss=4, tone=1.0) -> Image.Image:
    """Anti-aliased dark iron wires with a faint warm highlight."""
    W, H = size
    img = Image.new("RGBA", (W * ss, H * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = lambda pts: [(x * ss, y * ss) for x, y in pts]
    base = tuple(int(c * tone) for c in (20, 15, 13))
    hi = tuple(int(c * tone) for c in (120, 72, 46))
    for pts in polylines(part):
        d.line(s(pts), fill=base + (255,), width=int(width * ss), joint="curve")
    for pts in polylines(part):
        d.line([(x, y - width * ss * 0.25) for x, y in s(pts)], fill=hi + (170,), width=max(1, int(width * ss * 0.3)))
    return img.resize((W, H), Image.LANCZOS)


def line_mask(size=(1672, 941), width=9) -> np.ndarray:
    """Where the real wires are expected (for removing them from the chicken)."""
    W, H = size
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    for pts in polylines("base"):
        d.line(pts, fill=255, width=width)
    return np.asarray(m) > 0
