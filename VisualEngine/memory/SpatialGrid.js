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
    const removed = this.queryAt(point);
    for (const obj of removed) {
      this.remove(obj);
    }
    this.insert(newObject);
    return removed;
  }

  // MARK: - Queries

  /**
   * All objects with at least one collision point in any cell the rect overlaps.
   * Objects spanning multiple cells are returned exactly once.
   * @param {Rect} rect
   * @returns {GridPlaceable[]}
   */
  query(rect) {
    const minC = this._coord({ x: rect.x, y: rect.y });
    const maxC = this._coord({ x: rect.x + rect.width, y: rect.y + rect.height });

    const seen = new Set();
    const results = [];

    for (let cx = minC.x; cx <= maxC.x; cx++) {
      for (let cy = minC.y; cy <= maxC.y; cy++) {
        const bucket = this._cells.get(this._key(cx, cy));
        if (bucket === undefined) continue;
        for (const obj of bucket) {
          if (!seen.has(obj)) {
            seen.add(obj);
            results.push(obj);
          }
        }
      }
    }
    return results;
  }

  /**
   * All objects registered in the cell containing `point`.
   * @param {Point} point
   * @returns {GridPlaceable[]}
   */
  queryAt(point) {
    const c = this._coord(point);
    const bucket = this._cells.get(this._key(c.x, c.y));
    return bucket !== undefined ? bucket : [];
  }

  // MARK: - Internals

  /** @private */
  _key(x, y) {
    return x + "," + y;
  }

  /**
   * @private
   * @param {Point} p
   * @returns {{x: number, y: number}}
   */
  _coord(p) {
    return {
      x: Math.floor(p.x / this.cellSize),
      y: Math.floor(p.y / this.cellSize),
    };
  }

  /**
   * Distinct cell keys that contain at least one of `points`.
   * @private
   * @param {Point[]} points
   * @returns {Set<string>}
   */
  _uniqueCells(points) {
    const result = new Set();
    for (const p of points) {
      const c = this._coord(p);
      result.add(this._key(c.x, c.y));
    }
    return result;
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
      const filtered = bucket.filter((o) => o !== object);
      if (filtered.length === 0) {
        this._cells.delete(key);
      } else {
        this._cells.set(key, filtered);
      }
    }
  }
}
