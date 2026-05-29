import { MemorySubsystem } from "./memory/MemorySubsystem.js";
import { GeometrySubsystem } from "./geometry/GeometrySubsystem.js";

/**
 * Central reference / coordinator for the game's visual subsystem.
 *
 * Other parts of the app talk to `VisualEngine` rather than reaching into the
 * individual `shaders/`, `geometry/`, `view/`, and `memory/` folders directly.
 * Each subsystem registers its public API here and `VisualEngine` exposes it
 * to the rest of the codebase as a single entry point.
 *
 * Usage (rough):
 *     VisualEngine.shared.geometry.buildTunnel(...)
 *     VisualEngine.shared.view.present(scene)
 *
 * Subsystems live in their own folders; this file is intentionally lean — it
 * just wires them together.
 */
export class VisualEngine {
  constructor() {
    // Subsystem hooks (placeholders until each is implemented):
    //   this.shaders — filled in by files inside shaders/
    //   this.view    — filled in by files inside view/

    /** World-state storage. See `memory/MemorySubsystem.js`. */
    this.memory = new MemorySubsystem();

    /** Drawable shape construction. See `geometry/GeometrySubsystem.js`. */
    this.geometry = new GeometrySubsystem();
  }

  /**
   * Singleton instance — the canonical reference other files load.
   * @type {VisualEngine}
   */
  static get shared() {
    if (!VisualEngine._shared) {
      VisualEngine._shared = new VisualEngine();
    }
    return VisualEngine._shared;
  }
}
