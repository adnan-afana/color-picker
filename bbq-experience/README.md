# Ember House: scroll-driven BBQ prototype

A cinematic restaurant landing page. As you scroll, a skewer lifts off a live charcoal grill, flies along a curved path and lands on its serving plate. The finished dish then appears with steam. Scrolling back up plays everything in reverse.

**Built with:** React, TypeScript, GSAP, ScrollTrigger, MotionPathPlugin and plain CSS. The project uses Vite.

## Run it locally

```bash
cd bbq-experience
npm install
npm run dev
```

Open the URL Vite prints, usually <http://localhost:5173>.

To see each skewer's motion path drawn on screen, add `?debug` to the address: <http://localhost:5173/?debug>.

To create a production build in `dist/`, run `npm run build`. You can open that build with `npm run preview`.

## Replacing images (no code)

Every image is a separate file in `public/assets/`. To swap one, save your photo with the same file name and reload the page.

| What | File | Notes |
| --- | --- | --- |
| Grill (hero) | `assets/grill.jpg` | 16:9 image, viewed from above |
| Beef kebab skewer | `assets/skewers/beef.png` | Transparent PNG, skewer lying horizontally |
| Shish tawook skewer | `assets/skewers/tawook.png` | Transparent PNG |
| Grilled chicken skewer | `assets/skewers/chicken.png` | Transparent PNG |
| Empty plates | `assets/plates/{beef,tawook,chicken}-empty.png` | Square, transparent, viewed from above |
| Finished dishes | `assets/plates/{beef,tawook,chicken}-dish.png` | Same plate and framing as the empty version |

For the cleanest hand-off, shoot each empty plate and its finished dish from the same camera position, so only the food changes.

If you want different file names or folders, change the paths in `public/config/scene.json`.

The current images are placeholders, rendered by `tools/generate_placeholders.py`. Run `npm run assets` to regenerate them; this needs Python with numpy, pillow and scipy.

## Tuning the scene (no code)

All layout and motion settings live in **`public/config/scene.json`**, separate from the animation logic. The Animation Studio (phase 4) will edit this same file format visually.

### Global timing: `motion`

- **`scrub`**: how many seconds the animation takes to catch up with the scrollbar. Higher values feel smoother; `0` locks it to the scrollbar.
- **`pinLength`**: on desktop, how long the plates stay pinned on screen, in viewport heights.
- **`mobileEndOffset`**: on phones, the animation finishes when the plate's centre reaches this height on screen (`0.4` = 40% from the top).
- **`timing`**: when each phase starts and ends, as fractions of the scroll (0 = top of the page). The phases are:
  - `lift`
  - `flight`
  - `pull`
  - `fade`
  - `reveal`
  - `settle`

### Per-skewer settings: `skewers[]`

| Setting | Meaning |
| --- | --- |
| `animate` | `true` flies this skewer. `false` leaves it resting on the grill. |
| `timingOffset` | Delays this skewer relative to the others, e.g. `0.03`. |
| `grill` | Where the skewer rests on the grill: `x` and `y` in % of the grill image, `width` in % of the grill width, and `rotation` in degrees. |
| `lift` | How far it rises (`x`, `y` in % of the screen), its scale at the top of the lift (`peakScale`, where 1.2 = 120%), and a `tilt`. |
| `path` | `curviness` sets how rounded the curve is. `via` points bend the curve: `t` is 0–1 along the trip, and `x`, `y` are offsets in % of the screen. |
| `arrival` | Where it hovers over the plate (`x`, `y` as fractions of plate width), its `width` relative to the plate, its `rotation`, and the mid-flight `sway`. |
| `pull` | The sideways slide out of the meat. A negative `distance` slides it to the left. |
| `mobile` | Optional. Any of the groups above, used on screens narrower than 768 px. |

## How it works

- **Overlay layer** (`src/components/SkewerLayer.tsx`): the skewers sit in a fixed layer above the whole page, so neither section can clip them in transit.
- **Live anchors**: the grill has invisible slot markers, and each plate wrapper is measured too. On every frame the engine measures both and rebuilds the curved path between them with MotionPathPlugin. Because of this:
  - the skewer rides the grill upward before it detaches;
  - it lands exactly on the plate, even while the plates are pinned;
  - it re-anchors on resize, with nothing stale to recalculate.
- **Scroll timeline** (`src/animation/choreography.ts`): one scrubbed GSAP timeline per skewer drives six progress values (lift → settle). Reversing the scroll plays the same timeline backwards, so the reverse is exact.
- **Pure motion maths** (`src/animation/pose.ts`): turns those progress values into position, scale, rotation and opacity. It never touches the DOM.
- **Responsive and accessible**:
  - Desktop pins the plates so the hand-off happens on a still stage.
  - Mobile stacks the plates and finishes each one as it reaches the screen.
  - `prefers-reduced-motion` turns off the flight; the dishes simply fade in.

## Build phases

- [x] **Phase 1**: hero grill, three skewers, three serving plates (placeholder images)
- [x] **Phase 2**: complete scroll animation for the beef kebab, forward and reverse
- [ ] **Phase 3**: extend to all three skewers. The engine already supports this: set `"animate": true` on the other two, then tune their timing and paths.
- [ ] **Phase 4**: Animation Studio (uploads stored in IndexedDB, sliders, path editing, desktop and mobile preview, JSON import and export)
- [ ] **Phase 5**: flames, smoke, lighting polish
- [ ] **Phase 6**: mobile and performance pass
