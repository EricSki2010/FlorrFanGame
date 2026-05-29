import { Collisions } from "./collisions/Collisions.js";

/**
 * Mechanics subsystem — the game's rules/simulation logic (as opposed to the
 * visual side, which lives in `VisualEngine`).
 *
 * Currently owns collision detection; future mechanics (movement AI, damage,
 * spawning, ...) register here too, exposed as named properties.
 */
export class Mechanics {
  constructor() {
    /** Collision detection. See `collisions/Collisions.js`. */
    this.collisions = new Collisions();
  }
}
