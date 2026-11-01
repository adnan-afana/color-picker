"""
Image helpers for separating the protein from the restaurant's dish photos.

  - kebab_masks: the kebabs in the kebab photo, by colour inside a capsule;
  - quilt_fill: rebuilds what the removed protein hid by image quilting, i.e.
    copying real patches of rice from the restaurant's own photos, each chosen
    so its edges match what is already around it. No texture is invented.

(The tawook pieces are segmented with SAM in prepare_supplied_food.py: the
grilled chicken and the rice are too close in colour to separate reliably.)
"""
from __future__ import annotations

import cv2
import numpy as np


def keep_large(mask: np.ndarray, min_area: int) -> list[np.ndarray]:
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    return [lab == i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= min_area]


def fill_holes(mask: np.ndarray) -> np.ndarray:
    m = mask.astype(np.uint8)
    ff = m.copy()
    cv2.floodFill(ff, np.zeros((m.shape[0] + 2, m.shape[1] + 2), np.uint8), (0, 0), 1)
    return (m | (1 - ff)) > 0


def quilt_fill(rgb: np.ndarray, hole: np.ndarray, source: np.ndarray, patch=24, overlap=8, candidates=700, seed=7,
               source_rgb: np.ndarray | None = None) -> np.ndarray:
    """
    Fills `hole` with patches copied from `source` pixels.
    Each patch is the best match (with a little randomness) to whatever is
    already known around it, so rice continues as rice and plate as plate.
    `source_rgb` lets the patches come from another photo of the same shoot.
    """
    rng = np.random.default_rng(seed)
    img = rgb.astype(np.float32).copy()
    H, W = hole.shape
    known = ~hole
    src_img = rgb if source_rgb is None else source_rgb
    SH, SW = source.shape
    P, step = patch, patch - overlap
    # candidate patch origins: patches fully inside the source area
    src_ok = cv2.erode(source.astype(np.uint8), np.ones((P, P), np.uint8), anchor=(0, 0)) > 0
    src_ok[SH - P + 1:, :] = False
    src_ok[:, SW - P + 1:] = False
    sy, sx = np.where(src_ok)
    if len(sy) == 0:
        raise ValueError("no source texture available")
    win = np.lib.stride_tricks.sliding_window_view(src_img.astype(np.float32), (P, P), axis=(0, 1))  # H',W',3,P,P
    ys, xs = np.where(hole)
    y0, y1 = max(0, ys.min() - overlap), min(H - P, ys.max())
    x0, x1 = max(0, xs.min() - overlap), min(W - P, xs.max())
    filled = known.copy()
    # blend weights so neighbouring patches feather into each other
    ramp = np.minimum(np.minimum(np.arange(P) + 1, P - np.arange(P)) / overlap, 1.0)
    weight = np.outer(ramp, ramp)[..., None].astype(np.float32)
    acc = np.zeros_like(img)
    wsum = np.zeros((H, W, 1), np.float32)
    # Fill from the edge of the hole inwards, so every patch has known
    # surroundings to match against.
    depth = cv2.distanceTransform(hole.astype(np.uint8), cv2.DIST_L2, 5)
    grid = [(y, x) for y in range(y0, y1 + 1, step) for x in range(x0, x1 + 1, step) if hole[y:y + P, x:x + P].any()]
    grid.sort(key=lambda p: depth[p[0]:p[0] + P, p[1]:p[1] + P].max())
    for y, x in grid:
        region_hole = hole[y:y + P, x:x + P]
        valid = filled[y:y + P, x:x + P]
        pick = rng.integers(0, len(sy), candidates)
        cand = win[sy[pick], sx[pick]].transpose(0, 2, 3, 1)  # N,P,P,3
        target = img[y:y + P, x:x + P]
        if valid.any():
            diff = ((cand - target[None]) ** 2).sum(-1)
            ssd = (diff * valid[None]).sum((1, 2)) / valid.sum()
            best = np.argsort(ssd)[:3]
            choice = cand[rng.choice(best)]
        else:
            choice = cand[0]
        acc[y:y + P, x:x + P] += choice * weight
        wsum[y:y + P, x:x + P] += weight
        # make the new patch visible to the next match
        m = region_hole[..., None]
        cur = acc[y:y + P, x:x + P] / np.maximum(wsum[y:y + P, x:x + P], 1e-6)
        img[y:y + P, x:x + P] = np.where(m, cur, img[y:y + P, x:x + P])
        filled[y:y + P, x:x + P] |= region_hole
    out = rgb.astype(np.float32).copy()
    patched = acc / np.maximum(wsum, 1e-6)
    feather = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 1.5)[..., None]
    covered = (wsum > 0).astype(np.float32)
    feather *= covered
    out = out * (1 - feather) + patched * feather
    return np.clip(out, 0, 255).astype(np.uint8)


def kebab_masks(rgb: np.ndarray, capsules: list[tuple[tuple[float, float], tuple[float, float], float]]) -> list[np.ndarray]:
    """Each kebab: inside its capsule, the brown meat (hue below the rice)."""
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    hue_ok = (hsv[..., 0] <= 14) | (hsv[..., 0] >= 170)
    meat = hue_ok & (hsv[..., 1] > 70) & (hsv[..., 2] > 70)
    masks = []
    for p, q, r in capsules:
        cap = np.zeros(rgb.shape[:2], np.uint8)
        cv2.line(cap, tuple(map(int, p)), tuple(map(int, q)), 1, int(r * 2))
        m = (cap > 0) & meat
        m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
        parts = keep_large(m, 2000)
        m = max(parts, key=lambda c: c.sum()) if parts else m > 0
        masks.append(fill_holes(m))
    return masks
