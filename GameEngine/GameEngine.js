import { MemorySubsystem } from "./memory/MemorySubsystem.js";
import { Mechanics } from "./mechanics/Mechanics.js";

// Step tuning (PLACEHOLDERS — balance later).
const ACTIVE_MARGIN = 1.5; // simulate entities within 1.5× the camera rect
const RETARGET_INTERVAL = 10; // entities re-pick targets every N steps
const KNOCKBACK_SCALE = 0.5; // overlap → knockback strength
const MOVE_THRESHOLD = 0.5; // intended movement below this is zeroed
const MOVE_DECAY = 0.2; // intended movement is scaled by this each step (friction)

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
  }

  /**
   * Advance THIS world's simulation by one tick. Each world instance steps
   * independently (its own grid + mechanics), which is what multiple rooms need.
   *
   * Pipeline:
   *   1. Active set — query the grid for entities within `ACTIVE_MARGIN`× the
   *      camera (a margin past the screen) so just-off-view things still simulate.
   *   2. Retarget every `RETARGET_INTERVAL` steps (only the player, for now).
   *   3. Collision detection (penetration + contact normal).
   *   4. Knockback queue — push each entity away from the other, scaled by the
   *      OTHER's density / its own × penetration. Accumulated, kept SEPARATE from
   *      intended movement.
   *   5. Intended movement — each entity adds an impulse toward its target.
   *   6. Integrate (intended movement + knockback) → new positions (grid synced).
   *   7. Clear knockback (instantaneous, per-step).
   *   8. Decay intended movement (zero below threshold, else ×`MOVE_DECAY`).
   *
   * @param {{x:number,y:number,width:number,height:number}} camera World-space
   *   camera (center + size) defining what to simulate.
   * @param {Object|null} [player=null] The player entity — the only target
   *   candidate for now. Pass null when there's no player.
   * @returns {Array} the collisions detected this tick (reused array).
   */
  step(camera, player = null) {
    const grid = this.memory.worldMap;
    this._stepCount++;

    // 1. Active set within ACTIVE_MARGIN× the camera (reused buffer, no alloc).
    const w = camera.width * ACTIVE_MARGIN;
    const h = camera.height * ACTIVE_MARGIN;
    const active = grid.query(
      { x: camera.x - w / 2, y: camera.y - h / 2, width: w, height: h },
      this._active
    );

    // Membership set so knockback only lands on simulated entities (a neighbour
    // just outside the region must not accumulate knockback it never clears).
    const activeSet = this._activeSet;
    activeSet.clear();
    for (let i = 0; i < active.length; i++) activeSet.add(active[i]);

    // 2. Periodic retargeting.
    if (this._stepCount % RETARGET_INTERVAL === 0) {
      for (let i = 0; i < active.length; i++) active[i].retarget(player);
    }

    // 3. Collisions (penetration + contact normal).
    const hits = this.mechanics.collisions.detect(active, grid);

    // 4. Knockback queue: lighter entity gets shoved more (other.density/self),
    //    multiplied by how deep it's in (overlap).
    for (let i = 0; i < hits.length; i++) {
      const { a, b, overlap, nx, ny } = hits[i];
      const onA = (b.density / a.density) * overlap * KNOCKBACK_SCALE;
      a.addKnockback(-nx * onA, -ny * onA); // `a` is always active (detect's outer loop)
      if (activeSet.has(b)) {
        const onB = (a.density / b.density) * overlap * KNOCKBACK_SCALE;
        b.addKnockback(nx * onB, ny * onB);
      }
    }

    // 5. Intended movement toward target. The impulse is pre-scaled by
    //    (1 - MOVE_DECAY) so that, with the decay residual added back each step,
    //    the steady-state travel equals `speed` exactly (speed·(1-d) / (1-d)).
    for (let i = 0; i < active.length; i++) {
      const e = active[i];
      if (e.hasTarget) {
        const dir = Math.atan2(e.target.y - e.y, e.target.x - e.x);
        e.addMovement(dir, e.speed * (1 - MOVE_DECAY));
      }
    }

    // 6-8. Integrate, clear knockback, decay intended movement.
    for (let i = 0; i < active.length; i++) {
      const e = active[i];
      const vx = e.momentum * Math.cos(e.direction) + e.knockbackX;
      const vy = e.momentum * Math.sin(e.direction) + e.knockbackY;
      if (vx !== 0 || vy !== 0) e.moveTo(e.x + vx, e.y + vy, grid);
      e.knockbackX = 0;
      e.knockbackY = 0;
      e.decayMovement(MOVE_THRESHOLD, MOVE_DECAY);
    }

    return hits;
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
