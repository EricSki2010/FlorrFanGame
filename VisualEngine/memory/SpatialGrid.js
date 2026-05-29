// Spatial hash grid + the "placeable" contract objects must satisfy.

/**
 * The contract for anything that can be placed into a {@link SpatialGrid}.
 *
 * Swift used a `GridPlaceable: AnyObject` protocol so the grid could store
 * objects *by reference*. JS objects are already reference types, so there is
 * no protocol to declare — an object is "grid placeable" simply by exposing a
 * `collisionPoints` property:
 *
 *   - `collisionPoints` — an array of world-space points (`{x, y}`) the object
 *     occupies. These drive which cells the object is inserted into and are
 *     also used by collision logic. Every distinct cell that contains at least
 *     one collision point will hold a reference to the object.
 *
 * This file documents that shape via the `GridPlaceable` typedef below; there
 * is nothing to import.
 *
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 *
 * @typedef {Object} GridPlaceable
 * @property {Point[]} collisionPoints World-space points the object occupies.
 */

/**
 * @typedef {Object} Rect
 * @property {number} x      Left edge (min x).
 * @property {number} y      Top/bottom edge (min y).
 * @property {number} width  Extent along x.
 * @property {number} height Extent along y.
 */

/**
 * Uniform spatial hash grid for fast 2D range queries.
 *
 * World space is divided into fixed-size cells. Each object is inserted into
 * every cell that one of its `collisionPoints` falls into (deduped). Queries
 * (e.g. "what's inside the camera's viewport?") only walk the cells the query
 * rect touches.
 *
 * Only **references** to objects are stored — there is one shared instance per
 * object regardless of how many cells it spans.
 */
export class SpatialGrid {
  /**
   * @param {number} cellSize Width/height of a single cell, in world units.
   */
  constructor(cellSize) {
    if (!(cellSize > 0)) {
      throw new Error("SpatialGrid cellSize must be positive");
    }

    /** Width/height of a single cell, in world units (read-only after init). */
    this.cellSize = cellSize;

    /**
     * Cell key (`"x,y"`) → bucket of object references that overlap that cell.
     * The string key stands in for Swift's `Coord: Hashable` struct, since JS
     * Maps key objects by identity rather than by value.
     * @type {Map<string, GridPlaceable[]>}
     * @private
     */
    this._cells = new Map();

    /**
     * Reused scratch for `query` dedup — cleared, never returned. Safe to share
     * because `query` is never re-entrant (it calls nothing that calls `query`).
     * @type {Set<GridPlaceable>}
     * @private
     */
    this._querySeen = new Set();

    /**
     * Reused scratch for `_uniqueCells` — cleared and refilled each call. Safe to
     * share because the operations that use it (insert/remove/update/replace) run
     * sequentially and each fully consumes the set before the next refill.
     * @type {Set<string>}
     * @private
     */
    this._cellScratch = new Set();
  }

  /**
   * No-op kept for API parity with the Swift version.
   *
   * Swift pre-allocated dictionary buckets to avoid mid-load rehash spikes.
   * JS `Map` has no equivalent reserve API, so there is nothing to do here.
   * @param {number} _minimumCapacity
   */
  reserveCapacity(_minimumCapacity) {
    // Intentionally empty — Map grows transparently.
  }

  // MARK: - Mutation

  /** Insert `object` into every cell that contains one of its collision points. */
  insert(object) {
    for (const key of this._uniqueCells(object.collisionPoints)) {
      let bucket = this._cells.get(key);
      if (bucket === undefined) {
        bucket = [];
        this._cells.set(key, bucket);
      }
      bucket.push(object);
    }
  }

  /**
   * Remove `object` from every cell its current collision points live in.
   * Must be called *before* the object's collision points change if you plan
   * to re-insert after moving it — otherwise the stale cells won't be cleared.
   */
  remove(object) {
    this._removeFromCells(object, this._uniqueCells(object.collisionPoints));
  }

  /**
   * Convenience: remove from the cells the object *used to* occupy, then
   * re-insert based on its current collision points.
   * @param {GridPlaceable} object
   * @param {Point[]} oldCollisionPoints
   */
  update(object, oldCollisionPoints) {
    this._removeFromCells(object, this._uniqueCells(oldCollisionPoints));
    this.insert(object);
  }

  /** Wipe the entire grid. */
  removeAll() {
    this._cells.clear();
  }

  /**
   * Remove every object in the cell containing `point`, then insert `newObject`.
   * @param {Point} point
   * @param {GridPlaceable} newObject
   * @returns {GridPlaceable[]} The objects that were removed.
   */
  replace(point, newObject) {
    // Snapshot first: `queryAt` returns the live bucket, and `remove` now mutates
    // buckets in place (swap-remove). Iterating the live array while removing from
    // it would skip entries — so copy the references out before removing.
    const removed = this.queryAt(point).slice();
    for (let i = 0; i < removed.length; i++) {
      this.remove(removed[i]);
    }
    this.insert(newObject);
    return removed;
  }

  // MARK: - Queries

  /**
   * All objects with at least one collision point in any cell the rect overlaps.
   * Objects spanning multiple cells are returned exactly once.
   *
   * Allocation-free internally: the `seen` set used for dedup is reused across
   * calls. Results are written into `out` — pass your own reused array for a
   * zero-alloc hot path; omit it and a fresh array is returned, which is the
   * original behaviour, so existing callers are unaffected.
   *
   * @param {Rect} rect
   * @param {GridPlaceable[]} [out] Destination array (cleared first). Defaults to
   *   a fresh array. If you pass a reused buffer, its contents are overwritten on
   *   the next `query` — consume them before querying again.
   * @returns {GridPlaceable[]} `out`, filled with the results.
   */
  query(rect, out = []) {
    out.length = 0;
    const seen = this._querySeen;
    seen.clear();

    const cs = this.cellSize;
    const minCx = Math.floor(rect.x / cs);
    const minCy = Math.floor(rect.y / cs);
    const maxCx = Math.floor((rect.x + rect.width) / cs);
    const maxCy = Math.floor((rect.y + rect.height) / cs);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this._cells.get(this._key(cx, cy));
        if (bucket === undefined) continue;
        for (let i = 0; i < bucket.length; i++) {
          const obj = bucket[i];
          if (!seen.has(obj)) {
            seen.add(obj);
            out.push(obj);
          }
        }
      }
    }
    return out;
  }

  /**
   * All objects registered in the cell containing `point`.
   * @param {Point} point
   * @returns {GridPlaceable[]}
   */
  queryAt(point) {
    const bucket = this._cells.get(this._cellKey(point.x, point.y));
    return bucket !== undefined ? bucket : [];
  }

  // MARK: - Internals

  /** @private */
  _key(x, y) {
    return x + "," + y;
  }

  /**
   * Cell key (`"cx,cy"`) for a world-space coordinate — floors into cell indices
   * and joins them. The string concatenation is the one remaining per-call
   * allocation; it's kept (over numeric key packing) so cell indices stay
   * unbounded and negative-coordinate-safe.
   * @private
   */
  _cellKey(worldX, worldY) {
    return (
      Math.floor(worldX / this.cellSize) + "," + Math.floor(worldY / this.cellSize)
    );
  }

  /**
   * Distinct cell keys that contain at least one of `points`.
   *
   * Returns a REUSED set (`this._cellScratch`), cleared on each call — do not
   * hold the result across another grid operation. Internal callers consume it
   * immediately, which is why sharing it is safe.
   * @private
   * @param {Point[]} points
   * @returns {Set<string>}
   */
  _uniqueCells(points) {
    const set = this._cellScratch;
    set.clear();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      set.add(this._cellKey(p.x, p.y));
    }
    return set;
  }

  /**
   * @private
   * @param {GridPlaceable} object
   * @param {Set<string>} targetKeys
   */
  _removeFromCells(object, targetKeys) {
    for (const key of targetKeys) {
      const bucket = this._cells.get(key);
      if (bucket === undefined) continue;
      // Swap-remove in place — a cell's order doesn't matter, so overwrite the
      // object with the last element and drop the tail. No new array. Assumes at
      // most one occurrence per bucket, which `_uniqueCells`' dedup guarantees.
      const i = bucket.indexOf(object);
      if (i !== -1) {
        bucket[i] = bucket[bucket.length - 1];
        bucket.pop();
      }
      if (bucket.length === 0) {
        this._cells.delete(key);
      }
    }
  }
}
