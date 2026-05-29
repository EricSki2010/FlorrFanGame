// Collision detection — broadphase (spatial grid) + narrowphase (circle test),
// with within-frame pair dedup and deferred (return-a-list) dispatch.
//
// Design notes (the reasoning behind the choices here):
//   - An entity's `collisionPoints` land it in MULTIPLE grid cells, so the same
//     pair (A, B) surfaces many times in a sweep. We dedup with an integer-keyed
//     Set of ordered id pairs — this kills the A-vs-B / B-vs-A duplicate AND the
//     multi-cell duplicate in one structure.
//   - The pair key is a NUMBER, not a string, so there's no per-pair allocation
//     (string keys would churn the GC, which is what actually causes stutter).
//   - Narrowphase compares SQUARED distances, so no sqrt per pair.
//   - Reused scratch structures (`_checkedPairs`, `_results`) are cleared each
//     frame instead of reallocated — no per-frame garbage.
//   - This module only DETECTS. The response/prevention logic consumes the
//     returned list; it lives elsewhere.

/**
 * The shape an entity must have to take part in collision.
 * (It also needs `collisionPoints` so the grid can index it — that's the grid's
 * concern, handled wherever entities are inserted/updated.)
 *
 * @typedef {Object} CollisionEntity
 * @property {number} x               World-space center x.
 * @property {number} y               World-space center y.
 * @property {number} collisionRadius Circle radius used for the overlap test.
 *
 * @typedef {Object} Collision
 * @property {CollisionEntity} a
 * @property {CollisionEntity} b
 */

// 2^26. Entity ids must stay below this, and ID_SPAN^2 (~4.5e15) stays under
// Number.MAX_SAFE_INTEGER (~9.0e15), so packed pair keys never lose precision.
// Supports ~67M distinct entities over a session — far more than any frame.
const ID_SPAN = 67108864;

/**
 * Collision system. Reachable as `GameEngine.shared.mechanics.collisions`.
 */
export class Collisions {
  constructor() {
    /** Reused each frame; holds packed integer pair keys already checked. @private */
    this._checkedPairs = new Set();

    /** Stable integer id per entity, assigned lazily. WeakMap so dead entities
     * don't leak. @private @type {WeakMap<object, number>} */
    this._ids = new WeakMap();

    /** @private */
    this._nextId = 1;

    /** Reused output array — cleared, not reallocated, each frame. @private */
    this._results = [];
  }

  /**
   * Stable integer id for an entity (assigned on first sight).
   * @private
   */
  _idOf(entity) {
    let id = this._ids.get(entity);
    if (id === undefined) {
      id = this._nextId++;
      this._ids.set(entity, id);
    }
    return id;
  }

  /**
   * Run one collision sweep.
   *
   * For every entity: query the grid for entities whose cells overlap its
   * bounding box (broadphase), skip any pair already handled this frame, then
   * circle-overlap test the rest (narrowphase). Returns the colliding pairs.
   *
   * Broadphase correctness note: this relies on each entity's `collisionPoints`
   * adequately covering its circle relative to the grid's cell size (or cells
   * being at least as large as the biggest entity). Two overlapping circles
   * whose points don't share a cell would be missed — same size/cell trade-off
   * we discussed.
   *
   * @param {CollisionEntity[]} entities The authoritative entity list to sweep.
   * @param {import("../../../VisualEngine/memory/SpatialGrid.js").SpatialGrid} grid
   *   The spatial index to broadphase against (e.g. `VisualEngine.shared.memory.worldMap`).
   * @returns {Collision[]} Colliding pairs. NOTE: this is a reused array — read
   *   it (or copy it) before the next `detect` call overwrites it.
   */
  detect(entities, grid) {
    const checked = this._checkedPairs;
    checked.clear();
    const results = this._results;
    results.length = 0;

    for (let i = 0; i < entities.length; i++) {
      const a = entities[i];
      const ra = a.collisionRadius;
      const aId = this._idOf(a);

      // Broadphase: everything in A's bounding box. A big neighbour B is in many
      // cells, so it still gets found even though we only query A's own extent.
      const nearby = grid.query({
        x: a.x - ra,
        y: a.y - ra,
        width: ra * 2,
        height: ra * 2,
      });

      for (let j = 0; j < nearby.length; j++) {
        const b = nearby[j];
        if (b === a) continue;

        const bId = this._idOf(b);

        // Ordered integer pair key — dedups direction AND multi-cell repeats.
        const lo = aId < bId ? aId : bId;
        const hi = aId < bId ? bId : aId;
        const key = lo * ID_SPAN + hi;
        if (checked.has(key)) continue;
        checked.add(key);

        // Narrowphase: overlap when (ra + rb) > distance. Squared, no sqrt.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const r = ra + b.collisionRadius;
        if (dx * dx + dy * dy < r * r) {
          results.push({ a, b });
        }
      }
    }

    return results;
  }

  /**
   * Optional: turn the flat pair list into a per-entity index, so you can ask
   * "what is entity X touching?". Only build this if your response logic needs
   * it — a symmetric response (push-apart) can just iterate the flat pairs.
   *
   * @param {Collision[]} collisions
   * @returns {Map<CollisionEntity, CollisionEntity[]>}
   */
  groupByEntity(collisions) {
    const map = new Map();
    for (let i = 0; i < collisions.length; i++) {
      const { a, b } = collisions[i];
      let listA = map.get(a);
      if (listA === undefined) { listA = []; map.set(a, listA); }
      listA.push(b);
      let listB = map.get(b);
      if (listB === undefined) { listB = []; map.set(b, listB); }
      listB.push(a);
    }
    return map;
  }
}
