// Base game entity — the object the other subsystems read from:
//   - VisualEngine's SpatialGrid uses `collisionPoints`
//   - mechanics/collisions uses `x`, `y`, `collisionRadius`
//   - the view uses `display` (its Pixi object) + position
//
// One class with a `kind` field (composition over deep inheritance), so every
// entity shares the same hidden class — keeping property access monomorphic in
// the hot collision/AI loops.

import { Rarity, RARITY, rarityTier } from "./Rarity.js";
import {
  mobCollisionRadius,
  mobTexture,
  mobDensity,
  mobSpeed,
  mobRange,
} from "./MobVariety.js";

// Re-export so `import { Rarity, RARITY } from "./Entity.js"` keeps working.
export { Rarity, RARITY };

/**
 * Disposition "enum" — how an entity behaves toward the player. Frozen-object
 * enum, same pattern as `MobType` / `Rarity`.
 *   - `HOSTILE` — seeks/attacks the player.
 *   - `NEUTRAL` — ignores the player until provoked.
 *   - `PASSIVE` — never aggressive (wanders / flees).
 */
export const Disposition = Object.freeze({
  HOSTILE: "hostile",
  NEUTRAL: "neutral",
  PASSIVE: "passive",
});

const TWO_PI = Math.PI * 2;

// --- Generic radius formula for NON-mob kinds (player, petal, …) -------------
// Mobs size themselves from MobVariety (see the constructor); this generic
// kind+rarity formula is the fallback for everything else. PLACEHOLDER numbers.

/** Base radius per kind, in world units. Unknown kinds fall back to DEFAULT_BASE. */
const BASE_RADIUS = { player: 20, mob: 14, petal: 8 };
const DEFAULT_BASE = 12;

/** Per-tier growth: each rarity step makes the entity this much bigger. */
const RARITY_GROWTH = 0.12; // +12% per tier (placeholder)

// Generic density/speed/range for NON-mob kinds (mobs get theirs from
// MobVariety). PLACEHOLDER numbers — tune.
const DEFAULT_DENSITY = 30;
const DEFAULT_SPEED = 3;
const DEFAULT_RANGE = 600;
const DENSITY_RARITY_GROWTH = 0.5; // matches MobVariety's growth
const SPEED_RARITY_GROWTH = 0.1;

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
 * Source of locally-generated unique entity ids. Each `new Entity` without an
 * explicit `id` gets the next integer. NOTE: this is a unique *instance* id
 * (this bee vs that bee) — distinct from `kind`/`mobType`, which are the species
 * *type*. In server-authoritative multiplayer the server assigns ids; pass
 * `{ id }` to use an authoritative one instead of the local counter.
 */
let _nextEntityId = 1;

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
   * @param {number} [opts.momentum=0] Movement magnitude (how fast it's moving).
   * @param {number} [opts.direction=0] Movement heading in radians.
   * @param {string} [opts.disposition="neutral"] One of {@link Disposition} —
   *   how it behaves toward the player (hostile / neutral / passive).
   * @param {number} [opts.id] Unique instance id. Defaults to a local counter;
   *   pass one to use a server-assigned id (multiplayer).
   */
  constructor({ x = 0, y = 0, kind = "mob", rarity = Rarity.COMMON, mobType = null, disposition = Disposition.NEUTRAL, angle = 0, momentum = 0, direction = 0, id = _nextEntityId++ } = {}) {
    // Always assign the same fields in the same order → one shared hidden class.

    /** Unique instance id (this entity, not its species). Network-stable. */
    this.id = id;

    this.x = x;
    this.y = y;

    /** Facing/rotation in radians. Visual only — collision circles are
     * rotation-invariant, so this never affects `collisionPoints` or `detect`. */
    this.angle = angle;

    /** Movement magnitude — how fast the entity is moving (0 = at rest). */
    this.momentum = momentum;

    /** Movement heading in radians (independent of `angle`, the visual facing). */
    this.direction = direction;

    /** Per-frame knockback accumulator (cartesian). Summed during collision
     * response, applied, then cleared each step. Kept SEPARATE from momentum so
     * "being shoved" and "wanting to move" don't bleed into each other. */
    this.knockbackX = 0;
    this.knockbackY = 0;

    /** AI target as a world POINT — always an `{ x, y }`; `hasTarget` flags
     * whether it's active. A target is just an x/y, not an entity reference.
     * Reused (mutated) so retargeting allocates nothing. */
    this.target = { x: 0, y: 0 };
    this.hasTarget = false;

    this.kind = kind;
    this.rarity = rarity;

    /** Mob species (a `MobType`) when this is a mob, else null. */
    this.mobType = mobType;

    /** Behaviour toward the player — one of {@link Disposition}. */
    this.disposition = disposition;

    // Both branches assign the same derived stats in the same order, so the
    // hidden class stays identical whichever path runs.
    if (mobType !== null) {
      /** Derived from mob species + rarity; read every frame by collision. */
      this.collisionRadius = mobCollisionRadius(mobType, rarity);
      /** Sprite texture for the view (mobs render as sprites). */
      this.texture = mobTexture(mobType);
      /** Mass-like value driving collision push ratios. */
      this.density = mobDensity(mobType, rarity);
      /** Movement magnitude applied per step toward a target. */
      this.speed = mobSpeed(mobType, rarity);
      /** Target-detection range. */
      this.range = mobRange(mobType);
    } else {
      this.collisionRadius = Entity.radiusFor(kind, rarity);
      this.texture = null;
      const tier = rarityTier(rarity);
      this.density = DEFAULT_DENSITY * (1 + tier * DENSITY_RARITY_GROWTH);
      this.speed = DEFAULT_SPEED * (1 + tier * SPEED_RARITY_GROWTH);
      this.range = DEFAULT_RANGE;
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
   * @param {import("../memory/SpatialGrid.js").SpatialGrid} grid
   */
  moveTo(x, y, grid) {
    grid.remove(this); // uses current points → clears the OLD cells
    this.x = x;
    this.y = y;
    this._writePoints();
    grid.insert(this); // registers the NEW cells
  }

  // MARK: - Movement / AI

  /**
   * Add a movement impulse to the entity's `momentum`/`direction` (the "wanting
   * to move" velocity). Polar in, polar out — converts to cartesian, sums, and
   * converts back, so impulses from different directions combine correctly.
   * @param {number} dir Heading of the impulse, in radians.
   * @param {number} magnitude Impulse strength.
   */
  addMovement(dir, magnitude) {
    const vx = this.momentum * Math.cos(this.direction) + magnitude * Math.cos(dir);
    const vy = this.momentum * Math.sin(this.direction) + magnitude * Math.sin(dir);
    this.momentum = Math.hypot(vx, vy);
    this.direction = Math.atan2(vy, vx);
  }

  /**
   * Accumulate knockback (cartesian), kept separate from intended movement.
   * @param {number} x
   * @param {number} y
   */
  addKnockback(x, y) {
    this.knockbackX += x;
    this.knockbackY += y;
  }

  /**
   * Decay residual intended movement: zero it below `threshold` (so tiny drift
   * stops), otherwise scale by `factor` (friction/coast-to-stop).
   * @param {number} threshold
   * @param {number} factor
   */
  decayMovement(threshold, factor) {
    if (this.momentum < threshold) this.momentum = 0;
    else this.momentum *= factor;
  }

  /**
   * Aim at a world point if within `range`, else clear the target. Stores only
   * the position (a target is just an x/y). Placeholder until the dedicated
   * `Targeting.js` takes over — for now the only candidate is the player.
   * @param {{x:number,y:number}|null} candidate A point (or entity) to aim at.
   */
  retarget(candidate) {
    if (candidate && candidate !== this) {
      const dx = candidate.x - this.x;
      const dy = candidate.y - this.y;
      if (dx * dx + dy * dy <= this.range * this.range) {
        this.target.x = candidate.x;
        this.target.y = candidate.y;
        this.hasTarget = true;
        return;
      }
    }
    this.hasTarget = false;
  }
}
