// Dev-only debug overlay. Draws, over the world (so it follows the camera):
//   - collision circles  → RED    (each entity's collisionRadius)
//   - broadphase bounds   → BLUE   (each entity's AABB — the box the grid indexes
//                                   it by and collision broadphase queries)
//   - detection ranges    → ORANGE (each entity's range)
//
// Immediate-mode: one Pixi Graphics, cleared and redrawn every frame. This is a
// dev tool, so it's intentionally Pixi-coupled (unlike the rest of GameEngine).
// Requires the global `PIXI` to be loaded.

import { detectionRange } from "../entities/Targeting.js";

const RED = 0xff0000;    // collision circles
const BLUE = 0x0000ff;   // broadphase bounding boxes
const ORANGE = 0xffa500; // detection ranges

export class DebugDraw {
  /**
   * @param {Object} worldContainer The view's camera-transformed container
   *   (`VisualEngine.shared.view.world`) to draw into.
   */
  constructor(worldContainer) {
    this.world = worldContainer;
    this.g = new PIXI.Graphics();
    worldContainer.addChild(this.g);

    /** Master on/off. */
    this.enabled = true;
    /** Per-layer toggles. */
    this.showCircles = true; // red collision circles
    this.showBounds = false; // blue broadphase AABBs (off — noisy by default)
    this.showRanges = true; // orange detection ranges
  }

  /**
   * Redraw the overlay for the given entities (e.g. the list `view.draw` returns).
   * @param {Array} entities
   */
  draw(entities) {
    const g = this.g;
    g.clear();
    if (!this.enabled) return;

    // Keep the overlay on top of the entity sprites (re-add = move to front).
    this.world.addChild(g);

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];

      // Detection range (orange) — the EFFECTIVE range it's seeking with right
      // now (×1.5 for hostile, on only when aggroed, 0 for player/passive), so it
      // updates live as things aggro. 0 → not seeking → no circle drawn.
      if (this.showRanges) {
        const r = detectionRange(e);
        if (r > 0) {
          g.circle(e.x, e.y, r);
          g.stroke({ color: ORANGE, width: 2, alpha: 0.5 });
        }
      }

      // Collision circle (red).
      if (this.showCircles) {
        g.circle(e.x, e.y, e.collisionRadius);
        g.stroke({ color: RED, width: 2 });
      }

      // Broadphase bounds (blue) — the AABB (center ± collisionRadius) the grid
      // indexes the entity by and collision queries against.
      if (this.showBounds) {
        const r = e.collisionRadius;
        g.rect(e.x - r, e.y - r, r * 2, r * 2);
        g.stroke({ color: BLUE, width: 1, alpha: 0.5 });
      }
    }
  }

  /** Toggle the whole overlay. */
  toggle() {
    this.enabled = !this.enabled;
  }

  /** Remove the overlay graphics. */
  destroy() {
    this.g.destroy();
  }
}
