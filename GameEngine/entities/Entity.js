// Base game entity — the object the other subsystems read from:
//   - VisualEngine's SpatialGrid uses `collisionPoints`
//   - mechanics/collisions uses `x`, `y`, `collisionRadius`
//   - the view uses `display` (its Pixi object) + position
//
// One class with a `kind` field (composition over deep inheritance), so every
// entity shares the same hidden class — keeping property access monomorphic in
// the hot collision/AI loops.

import { RARITY, rarityTier } from "./Rarity.js";
import { mobCollisionRadius, mobTexture } from "./MobVariety.js";

// Re-export so existing `import { RARITY } from "./Entity.js"` keeps working.
export { RARITY };

const TWO_PI = Math.PI * 2;

// --- Generic radius formula for NON-mob kinds (player, petal, …) -------------
// Mobs size themselves from MobVariety (see the constructor); this generic
// kind+rarity formula is the fallback for everything else. PLACEHOLDER numbers.

/** Base radius per kind, in world units. Unknown kinds fall back to DEFAULT_BASE. */
const BASE_RADIUS = { player: 20, mob: 14, petal: 8 };
const DEFAULT_BASE = 12;

/** Per-tier growth: each rarity step makes the entity this much bigger. */
const RARITY_GROWTH = 0.12; // +12% per tier (placeholder)

// Collision points fill the whole disk as CONCENTRIC RINGS, so even entities
// larger than a grid cell are registered in EVERY cell they cover (not just the
// edge). Coverage rule: with a 128 grid, a point lands in every overlapped cell
// as long as the mesh is spaced < 128 in both directions.

/** Radial gap between rings (≤ cell/2 → safe coverage). */
const RING_SPACING = 64;

/** Arc gap on the OUTER edge ring — kept fine, because the edge is where circles
 * actually touch, so dense sampling there avoids grazing-contact misses. */
const EDGE_SPACING = 20;

/** Arc gap on INTERIOR rings — only needs to be < cell size for coverage, so it's
 * much coarser (fewer points). Inner rings have smaller circumference too. */
const POINT_SPACING = 100;

/**
 * Cache of ABSOLUTE offset arrays keyed by radius. Offsets are world-space
 * displacements from the entity's center (the radius is already baked in), so
 * `_writePoints` just adds them to the center — no per-point multiply. Entities
 * of the same radius share one array.
 * @type {Map<number, {dx: number, dy: number}[]>}
 */
const _offsetCache = new Map();

/**
 * Build (or fetch from cache) the concentric-ring offsets for a circle of
 * `radius`: a center point, the edge ring at `radius` (sampled finely, every
 * `EDGE_SPACING`), and interior rings every `RING_SPACING` inward (sampled
 * coarsely, every `POINT_SPACING`).
 * @param {number} radius
 * @returns {{dx: number, dy: number}[]}
 */
function offsetsForRadius(radius) {
  let offsets = _offsetCache.get(radius);
  if (offsets !== undefined) return offsets;

  offsets = [{ dx: 0, dy: 0 }]; // center — covers the entity's own center cell
  let ringR = radius;
  let isEdge = true; // the first (outermost) ring is the contact edge
  while (true) {
    const spacing = isEdge ? EDGE_SPACING : POINT_SPACING;
    const count = Math.max(1, Math.ceil((TWO_PI * ringR) / spacing));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TWO_PI;
      offsets.push({ dx: Math.cos(a) * ringR, dy: Math.sin(a) * ringR });
    }
    const next = ringR - RING_SPACING;
    if (next <= RING_SPACING * 0.5) break; // center covers the innermost gap
    ringR = next;
    isEdge = false;
  }
  _offsetCache.set(radius, offsets);
  return offsets;
}

/**
 * A game entity: a positioned circle with a collision radius.
 */
export class Entity {
  /**
   * Collision radius for a given kind + rarity. The single source of truth for
   * entity sizing — edit the tables/constants above to retune.
   * @param {string} kind
   * @param {string} rarity One of {@link RARITY}.
   * @returns {number} radius in world units
   */
  static radiusFor(kind, rarity) {
    const base = BASE_RADIUS[kind] ?? DEFAULT_BASE;
    return base * (1 + rarityTier(rarity) * RARITY_GROWTH);
  }

  /**
   * @param {Object} [opts]
   * @param {number} [opts.x=0]
   * @param {number} [opts.y=0]
   * @param {string} [opts.kind="mob"] Entity type tag (player / mob / petal / …).
   * @param {string} [opts.rarity="common"] One of {@link RARITY}.
   * @param {string|null} [opts.mobType=null] A `MobType` species. When set, this
   *   is a mob: `collisionRadius` and `texture` come from `MobVariety`. When null,
   *   `collisionRadius` uses the generic {@link Entity.radiusFor} and there's no
   *   texture (e.g. the player draws via `circleBody`).
   * @param {number} [opts.angle=0] Facing/rotation in radians (visual only).
   */
  constructor({ x = 0, y = 0, kind = "mob", rarity = "common", mobType = null, angle = 0 } = {}) {
    // Always assign the same fields in the same order → one shared hidden class.
    this.x = x;
    this.y = y;

    /** Facing/rotation in radians. Visual only — collision circles are
     * rotation-invariant, so this never affects `collisionPoints` or `detect`. */
    this.angle = angle;

    this.kind = kind;
    this.rarity = rarity;

    /** Mob species (a `MobType`) when this is a mob, else null. */
    this.mobType = mobType;

    // Both branches assign collisionRadius then texture, in that order, so the
    // hidden class stays identical whichever path runs.
    if (mobType !== null) {
      /** Derived from mob species + rarity; read every frame by collision. */
      this.collisionRadius = mobCollisionRadius(mobType, rarity);
      /** Sprite texture for the view (mobs render as sprites). */
      this.texture = mobTexture(mobType);
    } else {
      this.collisionRadius = Entity.radiusFor(kind, rarity);
      this.texture = null;
    }

    /**
     * Shared (read-only) unit offsets for this entity's size — point count
     * scales with the radius. Cached, so same-sized entities share one array.
     * @private
     */
    this._offsets = offsetsForRadius(this.collisionRadius);

    /**
     * World-space points that drive grid-cell membership. Allocated ONCE here
     * (length = `_offsets.length`) and mutated in place on every move — never
     * reallocated. Read by the grid.
     * @type {{x: number, y: number}[]}
     */
    this.collisionPoints = this._offsets.map((o) => ({
      x: x + o.dx,
      y: y + o.dy,
    }));

    /**
     * The entity's Pixi display object. Null until the view builds it on first
     * sight, then cached here. Declared up front so the hidden class is stable.
     */
    this.display = null;
  }

  /**
   * Rewrite `collisionPoints` in place for the current `x`/`y`/`collisionRadius`.
   * No allocation — mutates the existing point objects.
   * @private
   */
  _writePoints() {
    const offs = this._offsets;
    const pts = this.collisionPoints;
    const x = this.x;
    const y = this.y;
    for (let i = 0; i < offs.length; i++) {
      const o = offs[i];
      const p = pts[i];
      p.x = x + o.dx;
      p.y = y + o.dy;
    }
  }

  /**
   * Set the position and refresh collision points, WITHOUT touching any grid.
   * Use this before the entity is inserted (initial placement / spawning).
   * @param {number} x
   * @param {number} y
   */
  setPosition(x, y) {
    this.x = x;
    this.y = y;
    this._writePoints();
  }

  /**
   * Move an entity that is already in `grid`, keeping the grid in sync.
   *
   * Remove-before-mutate: `grid.remove` runs against the *current* (old) points
   * to clear the old cells, then the points are rewritten in place, then
   * `grid.insert` registers the new cells. This is why moving allocates nothing
   * and why you can't forget to re-index.
   *
   * @param {number} x
   * @param {number} y
   * @param {import("../../VisualEngine/memory/SpatialGrid.js").SpatialGrid} grid
   */
  moveTo(x, y, grid) {
    grid.remove(this); // uses current points → clears the OLD cells
    this.x = x;
    this.y = y;
    this._writePoints();
    grid.insert(this); // registers the NEW cells
  }
}
