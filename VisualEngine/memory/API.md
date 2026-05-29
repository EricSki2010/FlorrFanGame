# memory/ — API Reference

World-state storage for the visual engine. Owns the spatial index used by camera viewport queries and collision lookups.

> Conventions: a **point** is `{ x: number, y: number }`; a **rect** is `{ x, y, width, height }` (top-left + size, DOMRect-style).

---

## `MemorySubsystem`
**File:** `MemorySubsystem.js`

Wrapper that holds the live world data. Currently a thin owner of the spatial grid. Reachable as `VisualEngine.shared.memory`.

### Properties
- `worldMap: SpatialGrid` — the global 2D spatial index. Everything placed in the level goes in here.

### Constructor
- `new MemorySubsystem(cellSize = 128)` — creates the subsystem and its grid with the given cell size. Tune `cellSize` to roughly match your typical query area.

---

## `GridPlaceable` (shape)
**File:** `SpatialGrid.js`

Not a class — the duck-typed shape anything must have to live inside a `SpatialGrid`. JS objects are reference types, so there's no protocol to declare; an object is "grid placeable" simply by exposing:

- `collisionPoints: {x, y}[]` — world-space points the object occupies. Drives which cells the object is inserted into and is used by collision logic. Every distinct cell containing at least one collision point holds a reference to the object.

---

## `SpatialGrid`
**File:** `SpatialGrid.js`

Uniform spatial hash grid for fast 2D range queries. Divides world space into fixed-size cells; each object is registered in every distinct cell its collision points fall into. Stores **references** only — one shared instance per object regardless of how many cells it spans.

### Properties
- `cellSize: number` — width/height of one cell in world units (read-only after construction).

### Constructor
- `new SpatialGrid(cellSize)` — throws if `cellSize <= 0`.

### Capacity
- `reserveCapacity(minimumCapacity)` — **no-op**, kept for parity with the original. JS `Map` has no reserve API, so there's nothing to pre-allocate.

### Mutation
- `insert(object)` — registers the object in every cell its collision points fall into.
- `remove(object)` — unregisters the object from the cells its **current** collision points occupy. Call this *before* mutating the object's points.
- `update(object, oldCollisionPoints)` — scrubs the cells the object used to be in (using `oldCollisionPoints`), then re-inserts with its current collision points.
- `removeAll()` — wipes every cell.
- `replace(point, newObject) → GridPlaceable[]` — removes every object in the cell containing `point`, then inserts `newObject`. Returns the removed objects.

### Queries
- `query(rect) → GridPlaceable[]` — every object with at least one collision point in any cell the rect (`{x, y, width, height}`) overlaps. Deduped across multi-cell objects. Primary camera-viewport call.
- `queryAt(point) → GridPlaceable[]` — every object registered in the cell that contains `point` (`{x, y}`).
