import { SpatialGrid } from "./SpatialGrid.js";

/**
 * World-state storage for the visual engine.
 *
 * Currently owns the `worldMap` — a {@link SpatialGrid} that indexes everything
 * placed in the level by 2D position so the camera (and other systems) can
 * quickly ask "what's inside this rect?"
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
