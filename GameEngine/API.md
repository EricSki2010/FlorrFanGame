# GameEngine/ — API Reference

The **authoritative world** — the counterpart to `VisualEngine`. `GameEngine` owns the world state (the spatial index) and the rules (collision, and later AI/spawning); `VisualEngine` only renders. This is the half a headless, server-authoritative game runs with **no `VisualEngine` at all**.

`new GameEngine()` makes an independent world; `.shared` is a convenience singleton. (Multiple worlds/rooms → multiple instances, not the singleton.)

Subsystem folders:
- `memory/` — authoritative world state: the spatial index. See [`memory/API.md`](memory/API.md).
- `mechanics/` — rules/simulation logic (collision detection today; movement AI, damage, spawning later). See [`mechanics/API.md`](mechanics/API.md).
- `entities/` — entity definitions (`Entity`, `MobVariety`, `Rarity`). See [`entities/API.md`](entities/API.md).

> Modules are native ES modules — import them directly (`<script type="module">`, no build step).

---

## `GameEngine`
**File:** `GameEngine.js`

Entry point for the simulation. Exposes the subsystems as named properties.

### Static members
- `GameEngine.shared` — convenience singleton (lazily created). Prefer `new GameEngine()` per world when you need more than one.

### Properties
- `memory: MemorySubsystem` — world state (the spatial grid). See [`memory/API.md`](memory/API.md).
- `mechanics: Mechanics` — rules/simulation subsystem. See [`mechanics/API.md`](mechanics/API.md).

### Methods
- `step(camera, player = null) → Collision[]` — advance **this** world's simulation one tick. Each world instance steps independently (its own grid + mechanics). Pipeline:
  1. **Active set** — query the grid for entities within `ACTIVE_MARGIN`× (1.5×) the `camera` rect, so just-off-screen things still simulate.
  2. **Retarget** every `RETARGET_INTERVAL` (10) steps — currently only the `player` is a candidate, picked if within an entity's `range`.
  3. **Collision detection** — penetration + contact normal.
  4. **Knockback queue** — each entity shoved away from the other by `(other.density / self.density) × overlap × KNOCKBACK_SCALE`. Accumulated, kept separate from intended movement; only applied to active entities.
  5. **Intended movement** — each entity adds an impulse toward its target at its (rarity-scaled) `speed`.
  6. **Integrate** intended movement + knockback → new positions (grid synced via `moveTo`).
  7. **Clear knockback** (instantaneous, per-step).
  8. **Decay** intended movement (zero below `MOVE_THRESHOLD`, else ×`MOVE_DECAY`).

  Tuning constants (`ACTIVE_MARGIN`, `RETARGET_INTERVAL`, `KNOCKBACK_SCALE`, `MOVE_THRESHOLD`, `MOVE_DECAY`) are placeholders at the top of `GameEngine.js`.

---

## Usage example
```js
import { GameEngine } from "./GameEngine/GameEngine.js";

const grid = GameEngine.shared.memory.worldMap;            // broadphase index
const hits = GameEngine.shared.mechanics.collisions.detect(entities, grid);

for (const { a, b } of hits) {
  // ...resolve the collision (push apart / damage / block)...
}
```

The grid is passed in at call time, so the collision system stays decoupled from where the grid lives. `VisualEngine`'s view receives the same grid to draw from.
