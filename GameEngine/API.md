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
- `step(dt, entities) → Collision[]` — advance **this** world's simulation one tick. Each world instance steps independently (its own grid + mechanics). Phases: movement/AI *(TODO)* → grid sync *(via `Entity.moveTo`)* → collision detection *(implemented)* → response *(TODO)*. `dt` is seconds since the last step (unused until movement exists); `entities` is passed in for now (the entity manager will supply it later).

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
