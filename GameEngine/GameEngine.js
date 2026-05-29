import { MemorySubsystem } from "./memory/MemorySubsystem.js";
import { Mechanics } from "./mechanics/Mechanics.js";

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
  }

  /**
   * Advance THIS world's simulation by one tick. Each world instance steps
   * independently (its own grid + mechanics), which is what multiple rooms need.
   *
   * Phases run in order; only collision detection exists today — the others are
   * where movement/AI and response slot in:
   *   1. movement / AI            — TODO
   *   2. grid sync                — handled as entities move (`Entity.moveTo`)
   *   3. collision detection      — broadphase + narrowphase (below)
   *   4. collision response       — TODO (consumes the detected pairs)
   *
   * @param {number} dt Seconds since the last step. Use a fixed value for a
   *   deterministic sim. Currently unused until movement exists.
   * @param {Array} entities The entities to simulate (must already be in the
   *   grid). Passed in for now; once the entity manager lands, the world will
   *   supply its own list.
   * @returns {Array} the collision pairs detected this tick (reused array).
   */
  step(dt, entities) {
    // 1–2. movement / AI / grid sync — TODO (movement will use Entity.moveTo,
    //      which keeps the grid in sync as positions change).

    // 3. collision detection against this world's own grid.
    const hits = this.mechanics.collisions.detect(entities, this.memory.worldMap);

    // 4. collision response — TODO (push apart / damage), consumes `hits`.

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
