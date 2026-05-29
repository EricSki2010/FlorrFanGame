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

/**
 * Number of points sampled around the circle's edge (plus one center point).
 * Center + ring is enough to register the entity in every cell it overlaps *as
 * long as the entity's diameter is roughly ≤ the grid's cell size* (the same
 * size/cell trade-off discussed for broadphase). Much larger entities would
 * need area-filling points to be found correctly.
 */
const RING_SAMPLES = 8;

/**
 * Unit-circle offsets (center + ring), computed once and shared read-only by
 * every entity. `_writePoints` scales these by the entity's radius — so moving
 * never recomputes cos/sin and never allocates.
 * @type {{dx: number, dy: number}[]}
 */
const UNIT_OFFSETS = (() => {
  const offsets = [{ dx: 0, dy: 0 }]; // center
  for (let i = 0; i < RING_SAMPLES; i++) {
    const a = (i / RING_SAMPLES) * TWO_PI;
    offsets.push({ dx: Math.cos(a), dy: Math.sin(a) });
  }
  return offsets;
})();

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
   */
  constructor({ x = 0, y = 0, kind = "mob", rarity = "common", mobType = null } = {}) {
    // Always assign the same fields in the same order → one shared hidden class.
    this.x = x;
    this.y = y;
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
     * World-space points that drive grid-cell membership. Allocated ONCE here
     * and mutated in place on every move — never reallocated. Read by the grid.
     * @type {{x: number, y: number}[]}
     */
    this.collisionPoints = UNIT_OFFSETS.map((o) => ({
      x: x + o.dx * this.collisionRadius,
      y: y + o.dy * this.collisionRadius,
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
    const r = this.collisionRadius;
    const pts = this.collisionPoints;
    for (let i = 0; i < UNIT_OFFSETS.length; i++) {
      const o = UNIT_OFFSETS[i];
      const p = pts[i];
      p.x = this.x + o.dx * r;
      p.y = this.y + o.dy * r;
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
