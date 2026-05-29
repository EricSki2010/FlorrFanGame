# geometry/ — API Reference

Builds the drawable shape data the view reads off an entity. The web has no SpriteKit; rendering targets **PixiJS**, which is *retained-mode* — you build a display object once and Pixi keeps re-rendering it, you just move it. So geometry stores a build-once **factory** on the entity rather than a per-frame draw call.

---

## `GeometrySubsystem`
**File:** `GeometrySubsystem.js`

Reachable as `VisualEngine.shared.geometry`.

### Methods

#### `circleBody(entity, options) → factory`
Attaches a circle "body" to `entity` by storing a factory at **`entity.circleBody`**. Calling that factory builds and returns a Pixi `Container` holding the circle. Returns the same factory it stored.

- **`entity: object`** — the thing to attach the body to (e.g. the player). Gains a `circleBody` property.
- **`options: CircleBodyOptions`:**
  - `radius: number` — circle radius, in world units. *(required)*
  - `fill?: number | string` — fill colour; hex number `0xff0000` or CSS string `"#ff0000"`. Default `0xffffff`.
  - `stroke?: number | string` — outline colour. Omit for no outline.
  - `strokeWidth?: number` — outline width in world units. Needs `stroke` set and `strokeWidth > 0` to draw. Default `0`.
  - `alpha?: number` — fill opacity, 0–1. Default `1`.
- **Returns** the factory function (also stored at `entity.circleBody`).

##### The stored factory: `entity.circleBody(x = 0, y = 0) → PIXI.Container`
- Builds a fresh `PIXI.Container` with a circle `Graphics` child drawn at the container's local origin `(0, 0)` — so position lives on the container and moving the entity is just setting `.x`/`.y`.
- `x`, `y` set the container's initial position (the view can also set it afterward).
- Returns a `Container` (not a bare circle) so a texture can ride on top: `display.addChild(new PIXI.Sprite(texture))`.

⚠️ **Contracts:**
- Requires **PixiJS loaded as a global `PIXI`** before the factory is *called* (the factory is what touches Pixi, not `circleBody` itself — so attaching a body works before the Pixi app exists; only invoking the factory needs `PIXI`). Throws a clear error if called too early.
- The intended flow (in the view, once it exists): build the display object **once** on first sight, `stage.addChild` it, cache it on the entity, then only update `.x`/`.y` each frame — never rebuild per frame.

### Batching note
For a single draw call across many entities, prefer **sprites sharing one texture** (tint for colour, scale for size) over many distinct `Graphics`. The current `circleBody` builds a per-entity `Graphics`, which does **not** batch into one call. See the `view` work for the batched approach.

---

## Usage example
```js
import { VisualEngine } from "../VisualEngine.js";

VisualEngine.shared.geometry.circleBody(player, {
  radius: 20, fill: 0x00ff00, stroke: 0x000000, strokeWidth: 3,
});

// later, in the view (PIXI must be loaded):
const display = player.circleBody(player.x, player.y); // build once
stage.addChild(display);
// each frame: display.x = player.x; display.y = player.y;
```
