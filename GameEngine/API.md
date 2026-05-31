# GameEngine/ — API Reference

The **authoritative world** — the counterpart to `VisualEngine`. `GameEngine` owns the world state (the spatial index) and the rules (collision, and later AI/spawning); `VisualEngine` only renders. This is the half a headless, server-authoritative game runs with **no `VisualEngine` at all**.

`new GameEngine()` makes an independent world; `.shared` is a convenience singleton. (Multiple worlds/rooms → multiple instances, not the singleton.)

Subsystem folders:
- `memory/` — authoritative world state: the spatial index. See [`memory/API.md`](memory/API.md).
- `mechanics/` — rules/simulation logic (collision detection today; movement AI, damage, spawning later). See [`mechanics/API.md`](mechanics/API.md).
- `entities/` — entity definitions (`Entity`, `MobVariety`, `Rarity`). See [`entities/API.md`](entities/API.md).

Top-level helpers:
- `Regions.js` — sim-region rectangles + the center-containment merge `step` uses. See [Regions](#regions) below.

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
- `step(regions) → Collision[]` — advance **this** world's simulation one tick. Call it **once per tick** with the render region(s) to simulate. `regions` is a single rect or an array of them (center + size, world units); a server passes one per player. The engine takes *render regions*, not a camera — it's headless. Allied targets (player/pets) are discovered per region, so no separate player arg.

  First, **`mergeRegions`** (see [`Regions.js`](#regions)) folds overlapping regions together: a region whose **center** lies inside another collapses into their bounding box (transitively). The result is a set of **disjoint** boxes, each then simulated **independently** — so spread-out players cost the same as stepping each alone, while players piled in one spot become a single sweep instead of N overlapping ones. The merge adds a little un-rendered area at the box's corners; that's deliberately cheap (it falls in the cold LOD tier below).

  Per merged box:
  1. **Active set** — grid query of the box expanded by `ACTIVE_MARGIN` (1.5×) so just-outside things still simulate. A per-tick `processed` set skips anything an earlier box already handled, so no entity is stepped twice.
  2. **Retarget** every `RETARGET_INTERVAL` (10) steps via `entities/Targeting.js` `updateTargets`, over the box's whole active set — so a sleeping mob can wake when an ally nears.
  3. **Sim set** — the subset actually simulated: **awake** (`momentum > 0`, has knockback, or `hasTarget` — at-rest mobs skipped, #2) **and scheduled** — **hot** (inside one of the box's `sources`, i.e. a real render region) runs every step; **cold** (only in the margin/merge-padding) runs every `LOD_STRIDE` steps, phase-offset by `id` (#5). Steps 4–8 run over this subset; the grid still indexes all active entities, so movers still collide with sleepers.
  4. **Collision detection** over the sim set — penetration + contact normal.
  5. **Knockback queue** — each entity shoved away from the other by `(other.density / self.density) × overlap × KNOCKBACK_SCALE`. Lands on any active entity (waking a struck sleeper next step).
  6. **Intended movement** — each sim entity adds an impulse toward its target at its (rarity-scaled) `speed`.
  7. **Integrate** intended movement + knockback → new positions (grid synced via `moveTo`). Cold entities integrate `LOD_STRIDE`× the intended velocity to cover the steps they sat out, so average speed is unchanged.
  8. **Clear knockback** + **decay** intended movement (zero below `MOVE_THRESHOLD`, else ×`MOVE_DECAY`).

  Three performance levers, all correctness-preserving on screen:
  - **Sleep** (#2): at-rest mobs are excluded from the collision sweep and movement entirely — a world of mostly-idle mobs costs almost nothing beyond the active-set query.
  - **LOD** (#5): entities outside every real render region (the margin + merge-padding) simulate at `1/LOD_STRIDE` rate. Entities inside a render region always run full-rate, so the throttle is invisible.
  - **Region merge**: clustered players share one sweep instead of double-processing the overlap.

  > **Call once per tick.** LOD scheduling advances with the step counter, so call `step(allRegions)` a single time per tick — not once per player (that both double-processes overlaps and skews the LOD phase).

  Tuning constants (`ACTIVE_MARGIN`, `RETARGET_INTERVAL`, `KNOCKBACK_SCALE`, `MOVE_THRESHOLD`, `MOVE_DECAY`, `HOT_MARGIN`, `LOD_STRIDE`) are placeholders at the top of `GameEngine.js`.

---

## Regions
**File:** `Regions.js`

The rectangles `step` simulates inside — one per client render area (the engine is headless, so it thinks in *regions*, not cameras). Rects are **center-based**: `{ x, y, width, height }` with `(x, y)` the center.

- `mergeRegions(regions) → box[]` — fold overlapping regions together: if one region's **center** lies inside another, replace the pair with their bounding box, to a fixpoint (chains collapse transitively). Returns **disjoint** boxes; each carries `sources` — the original region(s) it covers, which `step` uses to tell a real render area from the box's cheap merge-padding corners. Pure (inputs untouched).
- `pointInRegion(px, py, r, slack?) → boolean` — is a point inside a center-based rect (optional `slack` multiplier on the extents, e.g. `1.05` for edge hysteresis)?
- `pointInAnyRegion(px, py, regions, slack?) → boolean` — any-of helper; `step` uses it for the hot/cold LOD test.

Closer players save more: the more the regions overlap, the more redundant sweeping the merge removes. Far-apart players don't merge and are simulated independently, costing the same as if each were alone.

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
