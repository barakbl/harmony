# Plan: Brush Opacity, Eraser, and Symmetry Mode

## Context

Harmony is a single-file (`index.html`) procedural drawing tool. This plan covers three new features: a brush opacity slider, an eraser tool, and a symmetry drawing mode. All changes are in `index.html`.

---

## 1. Brush Opacity Slider

**What:** A range slider (0%-100%) in the menu bar that controls stroke transparency globally.

**Implementation:**

- Add global variable `BRUSH_OPACITY = 1` (line ~1519 area)
- Add `<input type="range">` element in `Menu.init()` between the brush selector and Save button, with label showing current %
- Add CSS for the slider (small, inline with menu)
- In the menu, wire up `input` event to update `BRUSH_OPACITY` and the label
- Each brush currently hardcodes its own alpha multiplier (e.g. `0.1 * BRUSH_PRESSURE`, `0.05 * BRUSH_PRESSURE`). Multiply each by `BRUSH_OPACITY`:
  - `circles.stroke`: `0.1 * BRUSH_PRESSURE` → `0.1 * BRUSH_PRESSURE * BRUSH_OPACITY`
  - `chrome.stroke`: `0.1 * BRUSH_PRESSURE` → same pattern
  - `fur.stroke`: `0.1 * BRUSH_PRESSURE` → same
  - `grid.stroke`: `0.01 * BRUSH_PRESSURE` → same
  - `longfur.stroke`: `0.05 * BRUSH_PRESSURE` → same
  - `ribbon.init` (update fn): `0.05 * BRUSH_PRESSURE` → same
  - `shaded.stroke`: `(1 - (d / 1000)) * 0.1 * BRUSH_PRESSURE` → same
  - `simple.stroke`: `0.5 * BRUSH_PRESSURE` → same
  - `sketchy.stroke`: `0.05 * BRUSH_PRESSURE` → same
  - `squares.stroke`: two places (`BRUSH_PRESSURE` for fill and stroke) → same
  - `web.stroke`: two places (`0.5 * BRUSH_PRESSURE` and `0.1 * BRUSH_PRESSURE`) → same

## 2. Eraser Tool

**What:** An eraser entry in the brush dropdown that clears pixels where you draw.

**Implementation:**

- Add an `eraser` brush constructor/prototype following the same pattern as `simple` brush
- Uses `context.globalCompositeOperation = 'destination-out'` in `init()` and restores to `'source-over'` in `destroy()`
- Basic line drawing like `simple` brush but with full opacity so it fully erases
- Add `"eraser"` to the `BRUSHES` array (e.g. after `"grid"`)

## 3. Symmetry Mode

**What:** A dropdown in the menu to select symmetry axes (Off, 2, 3, 4, 6, 8). When active, every stroke is replicated across N evenly-spaced axes around the canvas center.

**Implementation - Multiple brush instances approach:**

- Add global variables: `SYMMETRY_AXES = 0` (0 = off), `symmetryBrushes = []`
- Add a `<select>` dropdown in `Menu.init()` after the opacity slider: options "Sym: Off", "2", "3", "4", "6", "8"
- Wire up change event to set `SYMMETRY_AXES` and call `recreateSymmetryBrushes()`
- When symmetry is on, maintain an array of brush instances (`symmetryBrushes[]`), one per axis
- On brush change or symmetry change, recreate the array
- On `strokeStart`: call `strokeStart` on main brush + all symmetry brushes with rotated coords
- On `stroke`: call `stroke` on main brush + all symmetry brushes with rotated coords
- On `strokeEnd`: call `strokeEnd` on all
- Helper function `getSymmetryPoints(x, y)` returns array of rotated points
- Center of rotation: `(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)`

### Key code locations to modify:

- **Globals** (~line 1516): Add `BRUSH_OPACITY`, `SYMMETRY_AXES`, `symmetryBrushes`
- **Menu.init()** (~line 1244): Add opacity slider + symmetry selector
- **Menu prototype properties** (~line 1226): Add `opacitySlider`, `opacityLabel`, `symmetrySelector`
- **onCanvasMouseDown** (~line 2139): Add symmetry strokeStart calls
- **onCanvasMouseMove** (~line 2169): Add symmetry stroke calls
- **onCanvasMouseUp** (~line 2177): Add symmetry strokeEnd calls
- **onCanvasTouchStart** (~line 2207): Add symmetry strokeStart calls
- **onCanvasTouchMove** (~line 2253): Add symmetry stroke calls
- **onCanvasTouchEnd** (~line 2300): Add symmetry strokeEnd calls
- **onMenuSelectorChange** (~line 1941): Recreate symmetry brushes
- **All brush strokeStyle lines**: Multiply alpha by `BRUSH_OPACITY`
- **New eraser brush**: Add before `// colorutils.js` section

### New helper functions:

```javascript
function getSymmetryPoints(x, y) {
    if (SYMMETRY_AXES <= 1) return [];
    var cx = SCREEN_WIDTH / 2, cy = SCREEN_HEIGHT / 2;
    var points = [];
    for (var i = 1; i < SYMMETRY_AXES; i++) {
        var angle = (i * 2 * Math.PI) / SYMMETRY_AXES;
        var dx = x - cx, dy = y - cy;
        var rx = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
        var ry = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
        points.push({x: rx, y: ry});
    }
    return points;
}

function recreateSymmetryBrushes() {
    symmetryBrushes.forEach(function(b) { b.destroy(); });
    symmetryBrushes = [];
    if (SYMMETRY_AXES > 1) {
        for (var i = 1; i < SYMMETRY_AXES; i++) {
            symmetryBrushes.push(eval("new " + BRUSHES[menu.selector.selectedIndex] + "(context)"));
        }
    }
}
```

---

## Verification

1. Open `index.html` in a browser
2. **Opacity slider**: Move slider, draw with different brushes - strokes should become more transparent at lower opacity
3. **Eraser**: Select "Eraser" from brush dropdown, draw over existing strokes - should erase to transparent
4. **Symmetry**: Select "4" from symmetry dropdown, draw near canvas edge - should see 4 mirrored strokes. Test with different brush types. Verify undo/redo still works. Toggle symmetry off and verify normal drawing resumes.
