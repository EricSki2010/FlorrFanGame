# VisualEngine/ — API Reference

The central coordinator for the game's visual subsystem. Other parts of the app talk to `VisualEngine.shared` rather than reaching into individual subsystem folders directly.

Subsystem folders:
- `geometry/` — drawable shape construction (e.g. `circleBody`). See [`geometry/API.md`](geometry/API.md).
- `view/` — the PixiJS app/stage + camera + per-frame draw. See [`view/API.md`](view/API.md).
- `textures/` — per-texture visual metadata (offset + sizing + rotation), keyed by image path. See [`textures/API.md`](textures/API.md).
- `shaders/` *(planned, maybe unused)* — custom GPU shaders. See [`shaders/API.md`](shaders/API.md).

> **World state lives in `GameEngine.memory`**, not here. The spatial grid is *game* state; the view receives it to draw from but doesn't own it. (This keeps the visual engine purely a renderer — a headless server runs `GameEngine` with no `VisualEngine` at all.)

> Modules are native ES modules — import them directly (`<script type="module">`, no build step). Rendering targets **PixiJS** (the web has no SpriteKit); drawing happens through a `PIXI` global loaded from a CDN.

---

## `VisualEngine`
**File:** `VisualEngine.js`

Entry point for rendering. Exposes the visual subsystems as named properties. `new VisualEngine()` makes an instance; `.shared` is a convenience singleton for the (single) client.

### Static members
- `VisualEngine.shared` — convenience singleton (lazily created on first access).

### Properties
- `geometry: GeometrySubsystem` — drawable shape construction. See [`geometry/API.md`](geometry/API.md).
- `view: ViewSubsystem` — the PixiJS presentation layer. See [`view/API.md`](view/API.md).

---

## Usage example
```js
import { VisualEngine } from "./VisualEngine/VisualEngine.js";
import { GameEngine } from "./GameEngine/GameEngine.js";

const grid = GameEngine.shared.memory.worldMap; // world state is in the game engine

// attach a drawable circle body to an entity:
VisualEngine.shared.geometry.circleBody(player, { radius: 20, fill: 0xff0000 });

// the view draws what the grid reports inside the camera each frame:
VisualEngine.shared.view.draw(grid, camera);
```
