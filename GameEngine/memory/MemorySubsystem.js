import { SpatialGrid } from "./SpatialGrid.js";

/**
 * Authoritative world-state storage for the game engine.
 *
 * Owns the `worldMap` — a {@link SpatialGrid} that indexes everything placed in
 * the world by 2D position, so collision and the (client) camera can quickly ask
 * "what's inside this rect?". This is game state, not visual state: the view
 * receives the grid to draw from but does not own it.
 */
export class MemorySubsystem {
  /**
   * @param {number} [cellSize=128] World units per grid cell. Pick something
   *   close to your typical query size (e.g. ~camera height / a few).
   */
  constructor(cellSize = 128) {
    /** The 2D world map. Camera viewport queries go through this. */
    this.worldMap = new SpatialGrid(cellSize);
  }
}
