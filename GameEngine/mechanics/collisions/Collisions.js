// Collision detection — broadphase (spatial grid) + narrowphase (circle test),
// with within-frame pair dedup and deferred (return-a-list) dispatch.
//
// Design notes (the reasoning behind the choices here):
//   - An entity spans MULTIPLE grid cells (it's indexed by its bounding box), so
//     the same pair (A, B) surfaces many times in a sweep. We dedup with an
//     integer-keyed Set of ordered id pairs — this kills the A-vs-B / B-vs-A
//     duplicate AND the multi-cell duplicate in one structure.
//   - The pair key is a NUMBER, not a string, so there's no per-pair allocation
//     (string keys would churn the GC, which is what actually causes stutter).
//   - Narrowphase compares SQUARED distances, so no sqrt per pair.
//   - Reused scratch structures (`_checkedPairs`, `_results`) are cleared each
//     frame instead of reallocated — no per-frame garbage.
//   - This module only DETECTS. The response/prevention logic consumes the
//     returned list; it lives elsewhere.

/**
 * The shape an entity must have to take part in collision. The grid indexes it
 * by the same `x`/`y`/`collisionRadius` (as a bounding box), so there's nothing
 * else to maintain.
 *
 * @typedef {Object} CollisionEntity
 * @property {number} x               World-space center x.
 * @property {number} y               World-space center y.
 * @property {number} collisionRadius Circle radius used for the overlap test.
 *
 * @typedef {Object} Collision
 * @property {CollisionEntity} a
 * @property {CollisionEntity} b
 * @property {number} overlap How deep they penetrate: `(ra + rb) - distance`.
 * @property {number} nx Unit contact normal x, pointing from `a` toward `b`.
 * @property {number} ny Unit contact normal y, pointing from `a` toward `b`.
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

    /** Reused query rect, mutated per entity instead of allocated. @private */
    this._rect = { x: 0, y: 0, width: 0, height: 0 };

    /** Reused broadphase buffer handed to `grid.query`. @private */
    this._nearby = [];
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
   * Broadphase is exact: the grid indexes every entity by its `center ±
   * collisionRadius` bounding box, and overlapping circles always have
   * overlapping AABBs, so a colliding pair always shares ≥1 cell — no size/cell
   * trade-off. (`entities` may be a subset of what's in the grid, e.g. only the
   * awake/scheduled ones; sleeping neighbours are still found via the grid.)
   *
   * @param {CollisionEntity[]} entities The entity list to sweep (broadphase
   *   initiators — typically the awake/scheduled subset of the active set).
   * @param {import("../../memory/SpatialGrid.js").SpatialGrid} grid
   *   The spatial index to broadphase against (e.g. `GameEngine.shared.memory.worldMap`).
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
      // Reuse the rect + buffer so the sweep allocates nothing per entity.
      const rect = this._rect;
      rect.x = a.x - ra;
      rect.y = a.y - ra;
      rect.width = ra * 2;
      rect.height = ra * 2;
      const nearby = grid.query(rect, this._nearby);

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

        // Narrowphase: overlap when (ra + rb) > distance. Squared check first
        // (no sqrt for non-collisions); sqrt only for the few real hits, where we
        // also need the penetration depth + contact normal.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const r = ra + b.collisionRadius;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          let dist = Math.sqrt(d2);
          let nx, ny;
          if (dist > 1e-9) {
            nx = dx / dist;
            ny = dy / dist;
          } else {
            // Coincident centers — pick an arbitrary axis to push along.
            dist = 0;
            nx = 1;
            ny = 0;
          }
          results.push({ a, b, overlap: r - dist, nx, ny });
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
