import { MemorySubsystem } from "./memory/MemorySubsystem.js";
import { Mechanics } from "./mechanics/Mechanics.js";
import { updateTargets } from "./entities/Targeting.js";
import { mergeRegions, pointInAnyRegion } from "./Regions.js";

// Step tuning (PLACEHOLDERS — balance later).
const ACTIVE_MARGIN = 1.5; // simulate entities within 1.5× the camera rect
const RETARGET_INTERVAL = 10; // entities re-pick targets every N steps
const KNOCKBACK_SCALE = 0.5; // overlap → knockback strength
const MOVE_THRESHOLD = 0.5; // intended movement below this is zeroed
const MOVE_DECAY = 0.2; // intended movement is scaled by this each step (friction)

// Level-of-detail: entities NOT inside any real render region (the active-set
// margin + the corner padding created when regions merge) are simulated only
// every LOD_STRIDE steps, moving LOD_STRIDE× as far when they do — average speed
// unchanged, ~1/LOD_STRIDE the cost. Entities inside a render region always run
// full-rate, so the throttle is invisible to players; it's what makes the merged
// corners cheap. (Step phase is offset by id so cold entities don't bunch up.)
const HOT_MARGIN = 1.05; // inside a render region ×this (edge slack) → "hot"
const LOD_STRIDE = 4; // cold entities simulate every Nth step

/**
 * Central coordinator for the game's simulation side — the counterpart to
 * `VisualEngine`. Where `VisualEngine` owns drawing and the spatial index,
 * `GameEngine` owns the rules: mechanics, collisions, and (later) AI.
 *
 * Other parts of the app talk to `GameEngine.shared` rather than reaching into
 * the subsystem folders directly.
 *
 * Usage (rough):
 *     const grid = GameEngine.shared.memory.worldMap;
 *     const hits = GameEngine.shared.mechanics.collisions.detect(entities, grid);
 *     for (const { a, b } of hits) { ...resolve... }
 */
export class GameEngine {
  constructor() {
    /** Authoritative world state — the spatial index. See `memory/MemorySubsystem.js`. */
    this.memory = new MemorySubsystem();

    /** Rules/simulation logic. See `mechanics/Mechanics.js`. */
    this.mechanics = new Mechanics();

    /** Steps elapsed — drives the periodic retarget. @private */
    this._stepCount = 0;
    /** Reused active-entity buffer (filled by the grid query each step). @private */
    this._active = [];
    /** Reused membership set for active entities. @private */
    this._activeSet = new Set();
    /** Reused buffer of entities actually simulated this step (the awake +
     * scheduled subset of `_active`). @private */
    this._sim = [];
    /** Reused per-region grid-query buffer (filtered into `_active`). @private */
    this._regionBuf = [];
    /** Per-tick set of entities already stepped, so overlapping merged boxes
     * don't double-process an entity. Cleared each `step`. @private */
    this._processed = new Set();
    /** Reused accumulator for the tick's collisions across all boxes. @private */
    this._allHits = [];
  }

  /**
   * Advance THIS world's simulation by one tick. Each world instance steps
   * independently (its own grid + mechanics), which is what multiple rooms need.
   *
   * `mergeRegions` first folds the given regions together — a region whose
   * center sits inside another collapses into a bounding box, so overlapping
   * players become ONE box swept once instead of once each. The result is a set
   * of **disjoint** boxes; each is then simulated **independently** by
   * `_stepRegion`, so spread-out players cost exactly the same as stepping each
   * alone (no global passes), while clustered players share one cheap sweep.
   *
   * Per merged box (`_stepRegion`):
   *   1. Active set — query the grid for the box expanded by `ACTIVE_MARGIN` (so
   *      just-outside things still simulate). A per-tick `processed` set skips
   *      anything already handled by an earlier box (covers the rare case where
   *      two un-merged boxes' margins overlap), so every entity is stepped once.
   *   2. Retarget every `RETARGET_INTERVAL` steps (see `entities/Targeting.js`):
   *      hostile/aggroed mobs lock onto the nearest ALLIED entity in range. Over
   *      this box's active set, so a sleeping mob wakes when an ally nears.
   *   3. Sim set — the subset actually simulated: AWAKE (moving / knocked / has a
   *      target — at-rest mobs are skipped, #2) and SCHEDULED. "Hot" = inside one
   *      of this box's `sources` (a real render region) → every step; "cold" =
   *      only in the margin/merge-padding → every `LOD_STRIDE` steps (#5). The
   *      grid still holds everyone, so a mover still collides with sleepers.
   *   4. Collision detection over the sim set (penetration + contact normal).
   *   5. Knockback — push each entity away from the other, scaled by the OTHER's
   *      density / its own × penetration. Lands on any active entity (waking a
   *      struck sleeper). Accumulated, SEPARATE from intended movement.
   *   6. Intended movement — each sim entity adds an impulse toward its target.
   *   7. Integrate (intended movement + knockback) → new positions (grid synced).
   *      Cold entities move LOD_STRIDE× to cover the steps they sat out. A moving
   *      entity also faces its intended heading (`angle = direction`).
   *   8. Clear knockback + decay intended movement.
   *
   * @param {{x:number,y:number,width:number,height:number}
   *   | Array<{x:number,y:number,width:number,height:number}>} regions One
   *   render region, or an array of them (center + size, world units) — one per
   *   player on a server. Overlapping regions are merged (see `Regions.js`).
   *   Allied targets (player / pets) are discovered per region, so no separate
   *   player arg.
   * @returns {Array} the collisions detected this tick (reused array).
   */
  step(regions) {
    const grid = this.memory.worldMap;
    const step = ++this._stepCount;

    const regionList = Array.isArray(regions) ? regions : [regions];
    const merged = mergeRegions(regionList);

    const allHits = this._allHits;
    allHits.length = 0;
    const processed = this._processed;
    processed.clear(); // dedup entities across boxes within this tick

    for (let m = 0; m < merged.length; m++) {
      this._stepRegion(merged[m], step, grid, processed, allHits);
    }
    return allHits;
  }

  /**
   * Simulate one (already-merged, disjoint) region box. Mirrors the single-region
   * pipeline; `step` calls it once per merged box. Reuses the per-region scratch
   * buffers (`_active`/`_activeSet`/`_sim`/`_regionBuf`) — safe because boxes are
   * processed sequentially, each fully consumed before the next.
   *
   * @param {{x,y,width,height,sources:Array}} box Merged box; `sources` are the
   *   original render region(s) it covers (drives the hot/cold LOD split).
   * @param {number} step Current step count (shared across boxes for LOD phase).
   * @param {import("./memory/SpatialGrid.js").SpatialGrid} grid
   * @param {Set} processed Entities already stepped this tick (cross-box dedup).
   * @param {Array} allHits Accumulator the tick's collisions are pushed into.
   * @private
   */
  _stepRegion(box, step, grid, processed, allHits) {
    const sources = box.sources;

    // 1. Active set for this box (expanded by ACTIVE_MARGIN), skipping anything
    //    an earlier box already handled this tick. activeSet also gates knockback.
    const w = box.width * ACTIVE_MARGIN;
    const h = box.height * ACTIVE_MARGIN;
    const found = grid.query(
      { x: box.x - w / 2, y: box.y - h / 2, width: w, height: h },
      this._regionBuf
    );
    const active = this._active;
    active.length = 0;
    const activeSet = this._activeSet;
    activeSet.clear();
    for (let i = 0; i < found.length; i++) {
      const e = found[i];
      if (processed.has(e)) continue;
      processed.add(e);
      active.push(e);
      activeSet.add(e);
    }

    // 2. Periodic retargeting over this box's active set (so a sleeping/cold mob
    //    can re-acquire a target — and thus wake — when an ally comes in range).
    if (step % RETARGET_INTERVAL === 0) {
      updateTargets(active, step);
    }

    // 3. Sim set: awake (#2) AND scheduled this step (#5). "Hot" = inside one of
    //    this box's real render regions (HOT_MARGIN edge slack) → every step;
    //    "cold" = only margin/merge-padding → every LOD_STRIDE, id-phased.
    const sim = this._sim;
    sim.length = 0;
    for (let i = 0; i < active.length; i++) {
      const e = active[i];
      const awake =
        e.momentum > 0 || e.knockbackX !== 0 || e.knockbackY !== 0 || e.hasTarget;
      if (!awake) continue; // #2: at-rest mobs aren't swept or moved
      const hot = pointInAnyRegion(e.x, e.y, sources, HOT_MARGIN);
      if (hot || (step + e.id) % LOD_STRIDE === 0) sim.push(e); // #5
    }

    // 4. Collisions over the sim set (grid still indexes every active entity, so
    //    a moving entity is still tested against sleeping neighbours).
    const hits = this.mechanics.collisions.detect(sim, grid);

    // 5. Knockback: lighter entity gets shoved more (other.density/self) × overlap.
    for (let i = 0; i < hits.length; i++) {
      const { a, b, overlap, nx, ny } = hits[i];
      const onA = (b.density / a.density) * overlap * KNOCKBACK_SCALE;
      a.addKnockback(-nx * onA, -ny * onA); // `a` is always in the sim set
      if (activeSet.has(b)) {
        // `b` may be a sleeper — the knockback wakes it (next step it's awake).
        const onB = (a.density / b.density) * overlap * KNOCKBACK_SCALE;
        b.addKnockback(nx * onB, ny * onB);
      }
      allHits.push(hits[i]); // detect allocates fresh hit objects, so refs are safe
    }

    // 6. Intended movement toward target. Pre-scaled by (1 - MOVE_DECAY) so the
    //    decay residual added back each step makes steady-state travel = `speed`.
    for (let i = 0; i < sim.length; i++) {
      const e = sim[i];
      if (e.hasTarget) {
        const dir = Math.atan2(e.target.y - e.y, e.target.x - e.x);
        e.addMovement(dir, e.speed * (1 - MOVE_DECAY));
      }
    }

    // 7-8. Integrate, clear knockback, decay — sim set only. Cold entities
    //      integrate LOD_STRIDE× the intended velocity to cover skipped steps;
    //      knockback is applied as-is (already accumulated).
    for (let i = 0; i < sim.length; i++) {
      const e = sim[i];
      // Face the INTENDED heading (not the knockback-blended displacement). Only
      // while actually intending to move, so a resting/shoved entity keeps its
      // last facing instead of snapping to 0.
      if (e.momentum > 0) e.angle = e.direction;
      const hot = pointInAnyRegion(e.x, e.y, sources, HOT_MARGIN);
      const lod = hot ? 1 : LOD_STRIDE;
      const vx = e.momentum * Math.cos(e.direction) * lod + e.knockbackX;
      const vy = e.momentum * Math.sin(e.direction) * lod + e.knockbackY;
      if (vx !== 0 || vy !== 0) e.moveTo(e.x + vx, e.y + vy, grid);
      e.knockbackX = 0;
      e.knockbackY = 0;
      e.decayMovement(MOVE_THRESHOLD, MOVE_DECAY);
    }
  }

  /**
   * Singleton instance — the canonical reference other files load.
   * @type {GameEngine}
   */
  static get shared() {
    if (!GameEngine._shared) {
      GameEngine._shared = new GameEngine();
    }
    return GameEngine._shared;
  }
}
