# Sindibad Grill & BBQ: grill-to-plate prototype

A restaurant landing page built around one scroll. As the visitor scrolls down from the grill, all three dishes are assembled together:

| Grill (left to right) | Plate (left to right) |
| --- | --- |
| Half chicken in its basket | Half chicken |
| Two of the three shish tawook skewers | Shish tawook |
| Two of the four kebab skewers | Kebab |

The steps, all in one shared transition:
1. The basket lid opens.
2. The food lifts and travels straight down to the plate below it, while the view moves once from the grill to the dishes.
3. The food settles onto the rice, and the skewer metal slides out.
4. The tawook pieces fan out to their places.

The rest:
- **What stays on the grill:** one tawook skewer, two kebab skewers and the empty basket.
- **Scrolling direction:** the page never scrolls the visitor back up. Scrolling up reverses the transition.

**Built with:** React, TypeScript, GSAP, ScrollTrigger, MotionPathPlugin and plain CSS. The project uses Vite.

## Run it locally

```bash
cd bbq-experience
npm install
npm run dev
```

Open the URL Vite prints, usually <http://localhost:5173>.

- **Motion paths:** add `?debug` to the address to draw them on screen.
- **Owner editor:** open <http://localhost:5173/#owner>.
- **Production build:** `npm run build` creates it in `dist/`; `npm run preview` serves that build.

## The food and plate images

Every image comes from the restaurant's own photos, kept in `tools/reference/supplied/`:
- `kebab-dish.webp`
- `tawook-dish.webp`
- `kebab-skewer.png`
- `tawook-skewer.png`
- `half-chicken.png`

`tools/prepare_supplied_food.py` turns them into the layers the page uses.

| Layer | Files | Made from |
| --- | --- | --- |
| Kebab on the grill and in the air | `assets/food/kebab-3*`, `kebab-4*` | The two kebabs cut from the kebab dish photo, on the metal of the isolated kebab skewer |
| Shish tawook on the grill and in the air | `assets/food/tawook-2*`, `tawook-3*` | The ten chicken pieces cut from the tawook dish photo, five per skewer, on the metal of the isolated tawook skewer |
| Half chicken | `assets/food/chicken-piece-1.webp` | The isolated half-chicken photo |
| Skewers that stay | `assets/food/kebab-1*`, `kebab-2*`, `tawook-1*` | The same pieces, mirrored |
| Dish bases | `assets/plates/<dish>-base.webp` | Each dish photo with only the arriving protein removed |
| Complete dish references | `assets/plates/<dish>-reference.webp` | The untouched dish photos (used in owner mode) |

### How the dishes stay authentic

- **Same food all the way down.** The protein that lands is the protein cut from that dish's own photo. So it looks the same on the grill, in the air and on the plate.
- **Exact landing.** It lands exactly where it lies in the photo, so the finished plate matches the restaurant's photo, with no second serving and no swap to a different image.
- **Rice and sides from the start.** The plate, rice, hummus, sauces, pickles, onion, tomato and potatoes are visible from the moment the dishes appear. Only the area hidden under the removed protein is rebuilt. It uses image quilting: real rice patches from the restaurant's kebab photo, chosen so their edges match. Both photos come from the same shoot.
- **No pixel change at the end.** After landing, each plate shows the food in its own layer, positioned with the same numbers.

### Known limitations of the source photos

- **No half-chicken dish photo was supplied.** The half chicken lands on the kebab plate's base (same plate, rice and sides) in the space the kebabs occupied. Replace the half-chicken dish base in owner mode, or add a real photo to `tools/reference/supplied/`.
- **Tawook rice:** the chicken pieces cover most of the rice in the tawook photo. The rice rebuilt under them is copied from the kebab photo's rice, which is the same rice from the same shoot.
- **Dish details:** no menu prices or descriptions were supplied, so none are shown. Add them per dish in `public/config/scene.json` (`price`, `description`) once confirmed.

### Rebuilding the layers

Run `npm run assets` to rebuild everything from the photos. It needs Python with these packages:
- numpy
- pillow
- opencv-contrib-python-headless
- rembg

The first run downloads the segmentation models.

The tawook pieces are found with SAM from one marked point per piece (`TAWOOK_POINTS` in the script). Its outlines are cached in `tools/.cache/`.

## Owner image editor (`#owner`)

**Who can open it:** anyone who knows the address. It isn't linked from the site, but this project has no sign-in. Before real use, put it behind your hosting's password protection or remove it from the public build.

**What it does.** For each dish there are three images:
- the food;
- the dish base;
- the complete dish reference.

For each image you can:
- upload a replacement;
- adjust its scale, horizontal and vertical position, and rotation;
- reset its position, or go back to the original image.

The preview shows the plate with the landed food. A slider overlays the complete dish photo for alignment, and a second view shows the food on the grill.

**Where edits are kept.** This project has no server-side storage, so edits are saved in this browser only (IndexedDB):
- **Show these edits on the site in this browser:** turns them on for this device. A banner then says the edits are local.
- **Never published:** they don't change the published website, and other visitors never see them.
- **Easy to lose:** clearing site data, a private window, or another browser or device loses them.
- **Export configuration:** saves a JSON file, with the images embedded, that can be imported on another device. Some embedded previews block downloads; the exported text then appears in a box to copy.
- **To publish:** put the final image files in `public/assets/` (same file names), or send the export to whoever updates the site.

## Tuning the scene (no code)

Settings live in `public/config/`:

| File | What's in it |
| --- | --- |
| `scene.json` | Copy, header links, dishes (left to right), grill items, and the scroll timeline (`motion`) |
| `grill-items.json` | Where each layer sits on the grill photo (written by the asset scripts) |
| `food-layout.json` | The moving food: its pieces, their places in the dish photos, and the plate images (written by the asset scripts) |

`motion.timeline` lists each phase as `[start, end]`, as fractions of the pinned scroll:
- `headline` (the hero headline fades so food never crosses it)
- `open`
- `lift`
- `flight`
- `settle`
- `slide`
- `spread`
- `handoff`

`scrollLength` sets how long the transition lasts, in screen heights, for desktop and mobile.

## How it works

- **Journey** (`src/App.tsx`): the hero and the dishes sit in one track that is pinned during the transition. The view moves down it exactly once.
- **Overlay** (`src/components/FoodLayer.tsx`): moving food and the basket lid render at the top of the page, outside every clipping container.
  - Pinning gives the journey a transform and clipped overflow. Anything fixed inside it would be cropped, which is what cut the chicken off before.
  - The header sits above the overlay, so food never covers the navigation.
  - Moving food is kept fully on screen at all times.
- **Live measurements** (`src/animation/pose.ts`): each frame, the engine measures each grill slot and plate and computes:
  - the curved path between them;
  - the landing pose that puts every piece on its spot in the photo;
  - how the pieces fan out.

  Measurements refresh after images load and whenever the layout changes size.
- **One timeline** (`src/animation/choreography.ts`): a single scrubbed GSAP timeline drives everything. Reversing the scroll plays it backwards.
- **Reduced motion:** nothing pins or moves. The finished dishes are shown, and the empty basket stays closed on the grill.
