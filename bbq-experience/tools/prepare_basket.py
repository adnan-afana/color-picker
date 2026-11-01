"""
Draws the wire grilling basket as two clean layers that line up with the
basket in the approved grill composite.

Output  public/assets/grill/basket-lid.png    lid (opens before the chicken lifts)
        public/assets/grill/basket-base.png   base + handle (stays on the grill)
        public/config/grill-items.json        their boxes (other entries are kept)

Run:  python3 tools/prepare_basket.py   (then tools/prepare_supplied_food.py)
Needs: numpy, pillow
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

import basket_geometry

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public" / "assets" / "grill"
LAYOUT = HERE.parent / "public" / "config" / "grill-items.json"
W, H = 1672, 941


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    layout = json.loads(LAYOUT.read_text()) if LAYOUT.exists() else {"items": {}}
    layout["frame"] = {"width": W, "height": H}
    for name, img in (("basket-lid", basket_geometry.render("lid")), ("basket-base", basket_geometry.render("base", tone=0.75))):
        a = np.asarray(img)[..., 3]
        ys, xs = np.where(a > 5)
        box = (int(xs.min()) - 2, int(ys.min()) - 2, int(xs.max()) + 3, int(ys.max()) + 3)
        img.crop(box).save(OUT / f"{name}.png", optimize=True)
        layout["items"][name] = {"box": list(box)}
    LAYOUT.write_text(json.dumps(layout, indent=2) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
