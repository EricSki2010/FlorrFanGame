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
 *     const grid = VisualEngine.shared.memory.worldMap;
 *     const hits = GameEngine.shared.mechanics.collisions.detect(entities, grid);
 *     for (const { a, b } of hits) { ...resolve... }
 */
export class GameEngine {
  constructor() {
    /** Rules/simulation logic. See `mechanics/Mechanics.js`. */
    this.mechanics = new Mechanics();
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
