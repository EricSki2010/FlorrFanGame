// Base game entity — the object the other subsystems read from:
//   - GameEngine's SpatialGrid indexes it by `x`, `y`, `collisionRadius` (the
//     bounding box → cell range); no per-entity point list anymore.
//   - mechanics/collisions uses `x`, `y`, `collisionRadius`
//   - the view uses `display` (its Pixi object) + position
//
// One class with a `kind` field (composition over deep inheritance), so every
// entity shares the same hidden class — keeping property access monomorphic in
// the hot collision/AI loops.

import { Rarity, RARITY, rarityTier } from "./Rarity.js";
import { Disposition } from "./Disposition.js";
import {
  mobCollisionRadius,
  mobTexture,
  mobDensity,
  mobSpeed,
  mobRangeMult,
  mobDisposition,
} from "./MobVariety.js";

// Re-export so `import { Rarity, RARITY, Disposition } from "./Entity.js"` works.
export { Rarity, RARITY, Disposition };

// --- Generic radius formula for NON-mob kinds (player, petal, …) -------------
// Mobs size themselves from MobVariety (see the constructor); this generic
// kind+rarity formula is the fallback for everything else. PLACEHOLDER numbers.

/** Base radius per kind, in world units. Unknown kinds fall back to DEFAULT_BASE. */
const BASE_RADIUS = { player: 30, mob: 14, petal: 8 };
const DEFAULT_BASE = 12;

/** Per-tier growth: each rarity step makes the entity this much bigger. */
const RARITY_GROWTH = 0.12; // +12% per tier (placeholder)

// Generic density/speed/range for NON-mob kinds (mobs get theirs from
// MobVariety). PLACEHOLDER numbers — tune.
const DEFAULT_DENSITY = 50;
const DEFAULT_SPEED = 7;
const DEFAULT_RANGE_MULT = 10; // detection range = collisionRadius × this
const DENSITY_RARITY_GROWTH = 0.5; // matches MobVariety's growth
const SPEED_RARITY_GROWTH = 0.1;

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
   * Spawn a mob into the world: build the `Entity` for a species + rarity at a
   * position, then (if a `grid` is given) register it so collision/AI/the view
   * pick it up. The one-call counterpart to the manual `new Entity(...)` +
   * `grid.insert(...)` dance done at boot.
   *
   * `entityName` is a {@link MobType} — its enum values *are* their string ids
   * (`MobType.BEE === "bee"`), so the constant or the raw id work identically
   * (hence "name/ID"). Disposition is inherited from the mob type (HOSTILE mobs
   * hunt, etc.); construct directly if you need to override it.
   *
   * The grid is passed in rather than reached for, so `Entity` stays decoupled
   * from where world state lives (and avoids an import cycle with `GameEngine`).
   * Omit it to build-and-position without inserting (e.g. to tweak the entity
   * before it enters the world, or for a headless test).
   *
   * @param {string} entityName A {@link MobType} species (name or id — same value).
   * @param {string} [rarity=Rarity.COMMON] One of {@link RARITY}.
   * @param {{x:number,y:number}} [pos] Spawn position (defaults to the origin).
   * @param {import("../memory/SpatialGrid.js").SpatialGrid} [grid] World index to
   *   insert into. When omitted, the entity is built but not registered.
   * @returns {Entity} the spawned entity.
   */
  static spawn(entityName, rarity = Rarity.COMMON, pos = { x: 0, y: 0 }, grid) {
    const entity = new Entity({
      x: pos.x,
      y: pos.y,
      mobType: entityName,
      rarity,
    });
    if (grid) grid.insert(entity);
    return entity;
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
   * @param {string} [opts.disposition] One of {@link Disposition}. Defaults to
   *   the mob type's disposition (from `MobVariety`) for mobs, else `NEUTRAL`.
   *   Pass to override (e.g. `ALLIED` for the player).
   * @param {*} [opts.ownerId=null] Controller id (a connection/player id) when
   *   input-driven; null for AI entities.
   * @param {number} [opts.id] Unique instance id. Defaults to a local counter;
   *   pass one to use a server-assigned id (multiplayer).
   */
  constructor({ x = 0, y = 0, kind = "mob", rarity = Rarity.COMMON, mobType = null, disposition, ownerId = null, angle = 0, momentum = 0, direction = 0, id = _nextEntityId++ } = {}) {
    // Always assign the same fields in the same order → one shared hidden class.

    /** Unique instance id (this entity, not its species). Network-stable. */
    this.id = id;

    this.x = x;
    this.y = y;

    /** Facing/rotation in radians. Collision circles are rotation-invariant, so
     * this never affects grid placement or `detect` — it's what the view renders
     * as `sprite.rotation`. `GameEngine.step` sets it to `direction` while the
     * entity is intending to move, so sprites face where they're headed. */
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

    /** In-combat flag. Hostile mobs seek regardless; a NEUTRAL mob only seeks
     * once this is set (e.g. by being attacked). Cleared by `Targeting` after a
     * few seconds without a target in range (the mob gives up the chase). */
    this.aggroed = false;

    /** Step at which a target was last in range — the aggro give-up timer's
     * reference point (see `Targeting.updateTargets`). */
    this.lastTargetStep = 0;

    this.kind = kind;
    this.rarity = rarity;

    /** Mob species (a `MobType`) when this is a mob, else null. */
    this.mobType = mobType;

    /** Allegiance/behaviour — one of {@link Disposition}. Explicit arg wins;
     * otherwise a mob inherits its type's default, non-mobs are NEUTRAL. */
    this.disposition =
      disposition ?? (mobType !== null ? mobDisposition(mobType) : Disposition.NEUTRAL);

    /** Controller id (a connection/player id) when input-driven, else null.
     * Set by the inputs subsystem; links a player entity to its controller. */
    this.ownerId = ownerId;

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
      /** Detection range — scales with size (radius × per-type multiplier). */
      this.range = this.collisionRadius * mobRangeMult(mobType);
    } else {
      this.collisionRadius = Entity.radiusFor(kind, rarity);
      this.texture = null;
      const tier = rarityTier(rarity);
      this.density = DEFAULT_DENSITY * (1 + tier * DENSITY_RARITY_GROWTH);
      this.speed = DEFAULT_SPEED * (1 + tier * SPEED_RARITY_GROWTH);
      this.range = this.collisionRadius * DEFAULT_RANGE_MULT;
    }

    /**
     * The entity's Pixi display object. Null until the view builds it on first
     * sight, then cached here. Declared up front so the hidden class is stable.
     */
    this.display = null;
  }

  /**
   * Set the position WITHOUT touching any grid. Use this before the entity is
   * inserted (initial placement / spawning); the grid reads `x`/`y` at insert.
   * @param {number} x
   * @param {number} y
   */
  setPosition(x, y) {
    this.x = x;
    this.y = y;
  }

  /**
   * Move an entity that is already in `grid`, keeping the grid in sync.
   *
   * Sets the new position, then `grid.update(this)` re-indexes it — but only if
   * the move crossed a cell boundary (the grid tracks where each object lives,
   * so a small move that stays in the same cells is a cheap no-op). The grid
   * works off `x`/`y`/`collisionRadius`, so there are no points to rewrite.
   *
   * @param {number} x
   * @param {number} y
   * @param {import("../memory/SpatialGrid.js").SpatialGrid} grid
   */
  moveTo(x, y, grid) {
    this.x = x;
    this.y = y;
    grid.update(this);
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

}
