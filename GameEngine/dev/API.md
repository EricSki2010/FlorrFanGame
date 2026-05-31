# dev/ — API Reference

Development-only tooling — debug helpers used while building, not shipped game logic. (Intentionally Pixi-coupled, unlike the rest of `GameEngine`.)

---

## `DebugDraw`
**File:** `DebugDraw.js`

An immediate-mode debug overlay drawn over the world (so it follows the camera). One Pixi `Graphics`, cleared and redrawn each frame.

Draws, per entity:
- **collision circles** → **red** (`collisionRadius`)
- **broadphase bounds** → **blue** (the `center ± collisionRadius` AABB the grid indexes by)
- **detection ranges** → **orange** (`range`, only when `> 0`)

### Constructor
- `new DebugDraw(worldContainer)` — pass the view's camera-transformed container (`VisualEngine.shared.view.world`). Requires the global `PIXI` to be loaded.

### Properties
- `enabled` — master on/off.
- `showCircles` / `showBounds` / `showRanges` — per-layer toggles.

### Methods
- `draw(entities)` — redraw for the given entities (e.g. the list `view.draw` returns); kept on top of the entity sprites.
- `toggle()` — flip `enabled`.
- `destroy()` — remove the overlay graphics.

### Usage
```js
const debug = new DebugDraw(view.world);
// each frame, after view.draw:
const visible = view.draw(grid, camera);
debug.draw(visible);
```
In `index.html` this is wired up with **`O`** to toggle.
