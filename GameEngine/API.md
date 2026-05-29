# GameEngine/ — API Reference

The central coordinator for the game's **simulation** side — the counterpart to `VisualEngine`. Where `VisualEngine` owns drawing and the spatial index, `GameEngine` owns the rules: mechanics, collisions, and (later) AI. Other parts of the app talk to `GameEngine.shared` rather than reaching into the subsystem folders directly.

Subsystem folders:
- `mechanics/` — rules/simulation logic (collision detection today; movement AI, damage, spawning later). See [`mechanics/API.md`](mechanics/API.md).

> Modules are native ES modules — import them directly (`<script type="module">`, no build step).

---

## `GameEngine`
**File:** `GameEngine.js`

Singleton entry point. Exposes the subsystems as named properties so callers can write things like `GameEngine.shared.mechanics.collisions`.

### Static members
- `GameEngine.shared` — the canonical singleton instance (lazily created on first access).

### Properties
- `mechanics: Mechanics` — rules/simulation subsystem. See [`mechanics/API.md`](mechanics/API.md).

---

## Usage example
```js
import { GameEngine } from "./GameEngine/GameEngine.js";
import { VisualEngine } from "./VisualEngine/VisualEngine.js";

const grid = VisualEngine.shared.memory.worldMap;          // broadphase index
const hits = GameEngine.shared.mechanics.collisions.detect(entities, grid);

for (const { a, b } of hits) {
  // ...resolve the collision (push apart / damage / block)...
}
```

`GameEngine` and `VisualEngine` stay decoupled: the grid is passed in at call time, so neither imports the other.
