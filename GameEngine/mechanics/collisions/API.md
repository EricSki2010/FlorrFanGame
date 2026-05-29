# collisions/ — API Reference

Circle-collision detection: **broadphase** against a `SpatialGrid`, then **narrowphase** circle-overlap tests, with within-frame pair dedup and deferred (return-a-list) dispatch. This subsystem only *detects* — the response/prevention logic consumes the returned list and lives elsewhere.

---

## `CollisionEntity` (shape)

Not a class — the duck-typed shape an entity must have to take part in collision:

- `x: number` — world-space center x.
- `y: number` — world-space center y.
- `collisionRadius: number` — circle radius used for the overlap test.

The entity **also** needs `collisionPoints: {x, y}[]` so the `SpatialGrid` can index it — that's the grid's concern, handled wherever entities are inserted/updated, not by this module.

---

## `Collision` (shape)

A detected colliding pair, as returned by `detect`:

- `a: CollisionEntity`
- `b: CollisionEntity`

---

## `Collisions`
**File:** `Collisions.js`

Collision system. Reachable as `GameEngine.shared.mechanics.collisions`. Holds reused scratch state (a checked-pairs `Set`, an id `WeakMap`, an output array) so a per-frame sweep allocates no garbage.

### Constructor
- `new Collisions()` — sets up the reused internal state. Access it via `GameEngine.shared.mechanics.collisions`.

### Methods

#### `detect(entities, grid) → Collision[]`
Runs one collision sweep and returns the colliding pairs.

- **`entities: CollisionEntity[]`** — the authoritative entity list to sweep.
- **`grid: SpatialGrid`** — the spatial index to broadphase against (e.g. `VisualEngine.shared.memory.worldMap`).
- **Returns** an array of `{ a, b }` pairs.

How it works:
- **Broadphase** — for each entity, queries `grid` for everything in its bounding box. A large neighbour is registered in many cells, so it's still found even though only the entity's own extent is queried.
- **Pair dedup** — an integer-keyed `Set` (packed ordered id pair `lo * 2²⁶ + hi`) skips any pair already handled this frame. This kills both the A-vs-B / B-vs-A duplicate **and** the multi-cell duplicate, with no per-pair allocation.
- **Narrowphase** — overlap when `(ra + rb)² > dist²` (squared distance, no `sqrt`).

⚠️ **Notes / contracts:**
- The returned array is **reused** across calls — read it (or copy it) before the next `detect` overwrites it.
- `detect` only **reads** the grid; it does not insert/move/remove. The caller must keep the grid in sync (`remove → move → insert`/`update`) as entities move.
- Broadphase correctness assumes each entity's `collisionPoints` cover its circle adequately relative to the grid's cell size (or cells ≥ the largest entity). Overlapping circles whose points share no cell would be missed — the cell-size/entity-size trade-off.
- Entity ids are assigned lazily and capped at ~67M distinct entities per session (2²⁶), keeping packed pair keys within `Number.MAX_SAFE_INTEGER`.

#### `groupByEntity(collisions) → Map<CollisionEntity, CollisionEntity[]>`
Optional. Turns the flat pair list into a per-entity index so you can ask "what is entity X touching?". Build this only if your response logic needs it — a symmetric response (push-apart) can just iterate the flat pairs.

- **`collisions: Collision[]`** — typically the array returned by `detect`.
- **Returns** a `Map` from each entity to the array of entities it collided with (both directions recorded).

---

## Usage example
```js
import { GameEngine } from "../../GameEngine.js";
import { VisualEngine } from "../../../VisualEngine/VisualEngine.js";

const grid = VisualEngine.shared.memory.worldMap;
const collisions = GameEngine.shared.mechanics.collisions;

// each frame, after moving entities and syncing them into the grid:
const hits = collisions.detect(entities, grid);
for (const { a, b } of hits) {
  // resolve symmetrically (push apart), or look up per-entity:
}

// optional per-entity view:
const touching = collisions.groupByEntity(hits);
const myHits = touching.get(player) ?? [];
```
