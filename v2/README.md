# Harmony v2

A modern UI rebuild of [Harmony](https://github.com/mrdoob/harmony) — Mr.doob's procedural drawing tool — keeping the original spirit (single file, no build step, generative brushes) while refreshing every surface a user touches.

The previous version is preserved unchanged at the repo root. v2 lives in this directory and is a drop-in replacement: open `v2/index.html` in any modern browser.

---

## What's new in v2

### UI
- **Floating glass toolbar** — frosted backdrop, pill-shaped, draggable by the grip handle on the left
- **Icon buttons with tooltips** — Save / Download / Rec / GIF / Upload / Undo / Redo / Clear / Reset Zoom / About
- **Grouped sections** with subtle dividers: Tools · Sliders · Files · History · View · Help
- **Two-color stacked swatches** for foreground / background, with hover lift
- **Pulsing record indicator** when GIF capture is active
- **Save toast** confirmation
- **About panel** rebuilt as a clean card with a categorised shortcut reference
- **Mobile breakpoints** — toolbar scrolls horizontally on narrow screens, controls shrink, picker grid reflows to 3 columns

### Drawing-feel quality-of-life
- **Cursor size ring** — faint, blend-mode circle at the pointer that matches `BRUSH_SIZE × zoomLevel`. Hides on touch, while drawing, and over UI elements
- **Recent colors strip** — auto-tracks the last 8 colors used to commit a stroke; sits above the saved palette in the picker; stored as `harmony-recent`
- **Hex code input** — `#rrggbb` field under the color wheel; paste from a design system, live-update on type, copy button to grab the current hex
- **Symmetry guides** — when symmetry > 1, soft rays are drawn on a non-printing UI overlay so you can see the rotation center and axes; never written to the artwork
- **Hold ⇧ for straight lines** — while drawing, hold shift to snap to one of 8 axes from the moment shift was first pressed (the shift color-wheel popup is suppressed mid-stroke to avoid the conflict)
- **Gesture toast** — 2-finger / 3-finger taps for undo/redo show a small "Undo" / "Redo" toast so you know it landed
- **Auto dark UI** — toolbar, picker, overflow menu, modals and About adapt to `prefers-color-scheme: dark`. Canvas background stays user-chosen

### Mobile-friendly toolbar
- A **"More" (⋯) overflow menu** holds secondary actions: Opacity, Symmetry, Download, Upload, About
- On phones and tablets the overflow opens as a **bottom sheet**; on desktop it's a popover anchored to the ⋯ button
- The brush picker also turns into a bottom sheet on mobile, with a drag-grabber pill, momentum scrolling, and a `max-height` so users can reach every brush one-handed
- Tighter spacing on `< 540px` (compact swatches, slimmer dividers, no brush name) and on `< 400px` the slider value labels and zoom indicator collapse away

### Modal dialog
- Centered glass card with backdrop blur replaces the native `confirm()` / `alert()` boxes
- Destructive actions (canvas **Clear**) get a red icon and a danger button
- Dismiss with `Esc` or by tapping the backdrop, confirm with `Enter`
- Used by Clear and GIF export errors today; `Modal.confirm({...})` / `Modal.alert({...})` is reusable for future flows

### Color palette
- A **swatch strip** lives below the color wheel in both the foreground and background pickers
- Default set: black, white, gray, red, orange, yellow, green, teal, blue, purple, pink, brown
- Tap a swatch to apply; the active swatch is highlighted
- **`+`** saves the current wheel color
- **edit** toggles delete-mode (✕ appears on each swatch); tap edit again to exit
- Persisted to `localStorage` under `harmony-palette`; the foreground and background pickers share the same palette and stay in sync

### Brush picker
- A custom **tile-grid popover** replaces the dropdown
- Brushes are organised by family: **Classic / Geometric / Atmospheric / Studio / Tools**
- Each tile shows a monochrome glyph and the brush name
- "NEW" badge on the v2 brushes
- The native `<select>` is kept as the source of truth, so the iPhone-reliable code path is unchanged — the picker just calls `selectedIndex` + dispatches `change`

### New brushes (5)
All support pressure and pen tilt.

| Brush      | What it does |
|------------|--------------|
| **Pixel**  | 8-bit grid stamps; dithered halo on heavier pressure |
| **Oil**    | 9 bristles + a binder pass for an oily feel |
| **Crayon** | Broad waxy body plus broken granular dashes for texture |
| **Sparkle**| Radial 8-point stars with a soft glow (`lighter` blend) |
| **Hatching** | Parallel hatch lines whose angle follows pen tilt |

### Toolbar controls
- **Brush size slider** — finally visible in the toolbar; stays in sync with the `d` / `f` keys
- **Opacity slider** — restyled with a custom thumb
- **Symmetry select** — restyled, with an inline icon

---

## Preserved from v1

Everything that already worked still works the same way:

- **Pointer Events** for pen + touch + mouse, with `pressure` and `tiltX/tiltY` on Apple Pencil and Wacom
- **Touch gestures**
  - 2-finger tap → Undo
  - 3-finger tap → Redo
  - 2-finger pinch → Zoom + pan
  - 3-finger swipe down → Collapse / expand toolbar
- **Keyboard shortcuts**
  - `d` / `f` — brush size
  - `r` — reset brush
  - `shift` (hold) — color wheel at cursor
  - `alt` (hold) — color picker (eyedropper)
  - `ctrl + scroll` — zoom
  - `b` — reset zoom
  - `H` — toggle toolbar collapse
  - `⌘ Z` / `⇧ ⌘ Z` — undo / redo
- **Save / Load** — auto-save to `localStorage`, plus SVG download/upload that round-trips the undo history
- **GIF export** from recorded strokes

---

## File layout

v2 is still one HTML file with everything inlined.

```
v2/
├── index.html      ← the app
├── changelog.txt   ← version history (rev. 14 entry added)
└── README.md       ← this file
```

The original v1 (`index.html`, `changelog.txt`) at the repo root is untouched.

---

## Running

```sh
# from the repo root
open v2/index.html
# or serve it
python3 -m http.server 8000
# then visit http://localhost:8000/v2/
```

No dependencies, no build, no npm. Just open the file.

---

## Compatibility

Tested-by-design (please verify on your device):
- Desktop Safari, Chrome, Firefox — mouse + keyboard
- iPad Safari — finger drawing, pinch/zoom, multi-finger gestures, **Apple Pencil** with pressure + tilt
- iPhone Safari — finger drawing, native `<select>` flow for symmetry, tile picker for brushes
- Wacom tablets (via Pointer Events `pressure`)

If a control feels off on your device, the v1 build at the repo root is a reliable fallback while issues are sorted out.

---

## Credits

- Original tool: [Mr.doob](http://mrdoob.com/) — [github.com/mrdoob/harmony](https://github.com/mrdoob/harmony)
- Fork & v2: [Barak Bloch](https://github.com/barakbl/harmony)
- Classic neighbour-line brushes (Sketchy / Shaded / Chrome / Fur / LongFur / Web) trace back to [The Scribbler](http://www.zefrank.com/scribbler/) by Ze Frank
