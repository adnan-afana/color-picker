# Sindibad Grill & BBQ: scroll-driven prototype

A cinematic restaurant landing page. As you scroll, food moves from a live charcoal grill to the serving plates below, one dish at a time:

1. Two kebab skewers lift off the grill and land on the kebab plate, then their metal skewers slide out.
2. Two shish tawook skewers do the same on the tawook plate.
3. The wire basket opens, and the half chicken moves to its plate. The basket stays on the grill.

The camera pans between the grill and each plate, so you see every lift and every landing. Scrolling back up plays everything in reverse.

**Built with:** React, TypeScript, GSAP, ScrollTrigger, MotionPathPlugin and plain CSS. The project uses Vite.

## Run it locally

```bash
cd bbq-experience
npm install
npm run dev
```

Open the URL Vite prints, usually <http://localhost:5173>.

To see each item's motion path drawn on screen, add `?debug` to the address: <http://localhost:5173/?debug>.

To create a production build in `dist/`, run `npm run build`. You can open that build with `npm run preview`.

## Replacing images (no code)

Every image is a separate file in `public/assets/`. To swap one, save your image with the same file name and reload the page.

| What | File | Notes |
| --- | --- | --- |
| Hero photo | `assets/hero/grill-hero.jpg` | 1672 × 941, empty grill with no food, text or logo |
| Flame flicker layer | `assets/hero/flames.png` | Same size as the hero photo; only the flames, rest transparent |
| Logo | `assets/brand/logo.png` | Transparent PNG |
| Skewer meat | `assets/grill/{kebab,tawook}-N-food.png` | Transparent; only the meat |
| Skewer metal | `assets/grill/{kebab,tawook}-N-metal.png` | Transparent; tip, handle and the rod through the meat. Same canvas as the meat image. |
| Half chicken | `assets/grill/chicken.png` | Transparent; no basket wires |
| Basket lid and base | `assets/grill/basket-lid.png`, `basket-base.png` | Transparent; the base includes the handle |
| Empty plates | `assets/plates/{beef,tawook,chicken}-empty.png` | Square, transparent, viewed from above |

Skewers are numbered from left to right on the grill:
- **Tawook:** 1 to 3. Numbers 2 and 3 move.
- **Kebab:** 1 to 4. Numbers 3 and 4 move.

There are no separate "finished dish" images. The food that lands on the plate is the finished dish, so nothing is duplicated.

### Where the food images come from

The food was cut out of the approved composite (`tools/reference/grill-food-reference.png`) by `tools/prepare_grill_items.py`, which also writes `public/config/grill-items.json`. That file records where each cut-out sits on the grill photo.

To replace the food with real photos:
- **Same framing:** keep each image's size and position on the 1672 × 941 grill frame. Then the grill layout stays correct.
- **Different framing:** update the boxes in `grill-items.json`.

The basket is redrawn as clean wire layers (`tools/basket_geometry.py`), because the photographed wires couldn't be separated from the chicken.

### Other generated assets

- **Hero photo, flame layer and logo:** cut out of the first approved hero mock-up (`tools/reference/hero-reference.png`) by `tools/prepare_hero_assets.py`. The logo was keyed out of a screenshot, so swap in the original logo file when you have it.
- **Empty plates:** still placeholders, rendered by `tools/generate_placeholders.py` (`npm run assets`).

The asset scripts need Python with these packages:
- numpy
- pillow
- scipy
- opencv-python-headless
- rembg

## Tuning the scene (no code)

All copy, images and motion settings live in **`public/config/scene.json`**, separate from the animation logic:
- **Header and headline:** `hero` holds the header links, the headline and the ORDER NOW destination.
- **Dishes:** `dishes` holds each dish's name, description, price and plate image.
- **Grill items:** `grillItems` lists every cut-out on the grill, from back to front.

### `motion`

| Setting | Meaning |
| --- | --- |
| `scrub` | Seconds the animation takes to catch up with the scrollbar. Higher feels smoother; `0` locks it to the scrollbar. |
| `scrollLength` | Length of the whole sequence in screen heights, for `desktop` and `mobile`. Longer means slower. |
| `plateFocus` | Where the camera frames each plate: its centre at this fraction of the screen height. |
| `lift` | How far food rises off the grill (`y`, in % of the screen height) and how much it grows (`scale`). |
| `path` | `curviness` sets how rounded the curve is. `via` points bend the curve: `t` is 0–1 along the trip, and `x`, `y` are offsets in % of the screen. |
| `lidAngle` | How far the basket lid opens, in degrees. |
| `steps` | The three transfers, in order (see below). |

### Each step

| Setting | Meaning |
| --- | --- |
| `dish` | Which plate it goes to. |
| `items` | What moves, and where it lands. `x`, `y` are offsets from the plate centre as fractions of the plate width. `rotation` is the angle on the plate. `length` (skewers) or `width` (chicken) is the size relative to the plate. |
| `stagger` | Delay between the two skewers of the same dish. |
| `lid` | The basket lid to open first (half chicken only). |
| `timing` | When each phase starts and ends, as fractions of the whole sequence (see below). The gaps between steps are the pauses. |

The phases in `timing` are:
- `return`: the camera pans back to the grill.
- `open`: the basket lid opens.
- `lift`: the food rises off the grill.
- `flight`: the food travels to its plate while the camera follows.
- `settle`: the food lands on the plate.
- `slide`: the metal skewers slide out.

## How it works

- **Journey** (`src/App.tsx`): the hero and the plates sit in one "track" that is pinned while you scroll. A camera value moves that track between the grill and each plate, so the lift and the landing are both on screen.
- **Header**: it sits outside the track, above the food, so moving food never covers the navigation. The Menu link jumps to the end of the sequence, where every dish is plated.
- **Food layer** (`src/components/FoodLayer.tsx`): moving food and the basket lid live in a fixed layer above both sections, so nothing is clipped in transit. Food that stays on the grill is drawn in the hero itself.
- **Live anchors**: each frame, the engine measures every grill slot and plate and rebuilds the curved path between them with MotionPathPlugin. Landing spots therefore come from the real plate elements, and stay aligned at any screen size or on resize.
- **Scroll timeline** (`src/animation/choreography.ts`): one scrubbed GSAP timeline drives the camera, the lid and each item's progress. Reversing the scroll plays the same timeline backwards, so the reverse is exact.
- **Pure motion maths** (`src/animation/pose.ts`): turns progress values into position, scale, rotation, shadows and the skewer slide. It never touches the DOM.
- **Reduced motion**: with `prefers-reduced-motion`, nothing is pinned or moves. The dishes are shown already plated.
