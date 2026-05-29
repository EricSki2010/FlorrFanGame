# VisualEngine/ — API Reference

The central coordinator for the game's visual subsystem. Other parts of the app talk to `VisualEngine.shared` rather than reaching into individual subsystem folders directly.

Subsystem folders:
- `memory/` — world-state storage (the spatial index). See [`memory/API.md`](memory/API.md).
- `geometry/` — drawable shape construction (e.g. `circleBody`). See [`geometry/API.md`](geometry/API.md).
- `view/` *(planned)* — the PixiJS app/stage + camera. See [`view/API.md`](view/API.md).
- `shaders/` *(planned, maybe unused)* — custom GPU shaders. See [`shaders/API.md`](shaders/API.md).

> Modules are native ES modules — import them directly (`<script type="module">`, no build step). Rendering targets **PixiJS** (the web has no SpriteKit); drawing happens through a `PIXI` global loaded from a CDN.

---

## `VisualEngine`
**File:** `VisualEngine.js`

Singleton entry point. Exposes the subsystems as named properties so callers can write things like `VisualEngine.shared.memory.worldMap`.

### Static members
- `VisualEngine.shared` — the canonical singleton instance (lazily created on first access).

### Properties
- `memory: MemorySubsystem` — world-state storage subsystem. See [`memory/API.md`](memory/API.md).
- `geometry: GeometrySubsystem` — drawable shape construction. See [`geometry/API.md`](geometry/API.md).

---

## Usage example
```js
import { VisualEngine } from "./VisualEngine/VisualEngine.js";

const grid = VisualEngine.shared.memory.worldMap;
grid.insert(myObstacle);

const visible = grid.query(cameraViewportRect);   // { x, y, width, height }
for (const obj of visible) { /* draw */ }

// attach a drawable circle body to an entity:
VisualEngine.shared.geometry.circleBody(player, { radius: 20, fill: 0xff0000 });
```
