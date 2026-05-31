# memory/ — API Reference

Authoritative world-state storage for the **game engine**. Owns the spatial index used by collision lookups and (client-side) camera viewport queries. This is game state — the view receives the grid to draw from but doesn't own it.

> Conventions: a **point** is `{ x: number, y: number }`; a **rect** is `{ x, y, width, height }` (top-left + size, DOMRect-style).

---

## `MemorySubsystem`
**File:** `MemorySubsystem.js`

Wrapper that holds the live world data. Currently a thin owner of the spatial grid. Reachable as `GameEngine.shared.memory`.

### Properties
- `worldMap: SpatialGrid` — the global 2D spatial index. Everything placed in the level goes in here.

### Constructor
- `new MemorySubsystem(cellSize = 256)` — creates the subsystem and its grid with the given cell size. Default is **256**, tuned for the game's typical ~size-200 mobs (rule of thumb: `cellSize ≈ typical entity diameter`). Bigger cells make moving/re-indexing large mobs much cheaper (benchmarked ~−73% vs 128) at little broadphase cost since big mobs don't pack densely; drop toward ~128 if the world becomes dominated by small, tightly-packed mobs.

---

## `GridPlaceable` (shape)
**File:** `SpatialGrid.js`

Not a class — the duck-typed shape anything must have to live inside a `SpatialGrid`. JS objects are reference types, so there's no protocol to declare; an object is "grid placeable" simply by exposing a position and a radius:

- `x, y: number` — world-space center.
- `collisionRadius: number` — circle radius. The grid registers the object in every cell its **axis-aligned bounding box** (`center ± collisionRadius`) overlaps.

> Earlier versions indexed by a `collisionPoints` array sampled around the disk. That's gone: the AABB cell range is exact for circles, costs nothing to recompute on a move, and removes the old "points must be spaced under the cell size" coupling. Big entities no longer carry hundreds of points to rewrite each move.

---

## `SpatialGrid`
**File:** `SpatialGrid.js`

Uniform spatial hash grid for fast 2D range queries. Divides world space into fixed-size cells; each object is registered in every cell its bounding box overlaps. Stores **references** only — one shared instance per object regardless of how many cells it spans. It also tracks each object's current cell-range internally (a `_placement` map), so it always knows where it put something.

### Properties
- `cellSize: number` — width/height of one cell in world units (read-only after construction).

### Constructor
- `new SpatialGrid(cellSize)` — throws if `cellSize <= 0`.

### Capacity
- `reserveCapacity(minimumCapacity)` — **no-op**, kept for parity with the original. JS `Map` has no reserve API, so there's nothing to pre-allocate.

### Mutation
- `insert(object)` — registers the object in every cell its bounding box overlaps, and records its cell-range.
- `remove(object)` — unregisters the object using its **stored** cell-range. No ordering rule: it works regardless of whether the object has already moved (the grid remembers where it was).
- `update(object)` — re-index after a move. Recomputes the cell-range and, **only if it changed**, moves the object between cells; a move that stays within the same cells returns immediately (the cheap fast path most slow movers hit each frame). Inserts if not yet present. *(No `oldCollisionPoints` arg anymore — the grid tracks placement itself.)*
- `removeAll()` — wipes every cell and all placement records.
- `replace(point, newObject) → GridPlaceable[]` — removes every object in the cell containing `point`, then inserts `newObject`. Returns the removed objects.

### Queries
- `query(rect) → GridPlaceable[]` — every object whose cells overlap the rect (`{x, y, width, height}`). Deduped across multi-cell objects. Primary camera-viewport call.
- `queryAt(point) → GridPlaceable[]` — every object registered in the cell that contains `point` (`{x, y}`).
