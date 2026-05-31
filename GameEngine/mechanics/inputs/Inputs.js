// Inputs — turns player input into the SAME "wanting to move" intent the AI
// produces for mobs. The whole job is "set the player entity's target point";
// `GameEngine.step` then moves it exactly like any seeking mob.
//
// Identity is by CONTROLLER (a connection/session id), not by hardware. The
// server maps each connection to a player entity and feeds intent here; locally
// there's just one controller. Either way the sim code is identical.
//
// Clients send INTENT (a point to steer toward / stop), never positions — the
// server stays authoritative on where the player actually ends up.

/**
 * Input application + the controller→player registry. Reachable as
 * `GameEngine.shared.mechanics.inputs`.
 */
export class Inputs {
  constructor() {
    /** Controller id → player entity. @private @type {Map<*, Object>} */
    this._players = new Map();
  }

  /**
   * Register a player entity under a controller id (e.g. on connect). Also
   * stamps `entity.ownerId` so the entity points back at its controller.
   * @param {*} ownerId
   * @param {Object} entity
   */
  register(ownerId, entity) {
    entity.ownerId = ownerId;
    this._players.set(ownerId, entity);
  }

  /**
   * Drop a controller's player (e.g. on disconnect). Clears the back-link.
   * @param {*} ownerId
   */
  unregister(ownerId) {
    const e = this._players.get(ownerId);
    if (e) e.ownerId = null;
    this._players.delete(ownerId);
  }

  /**
   * The player entity a controller owns, or null.
   * @param {*} ownerId
   * @returns {Object|null}
   */
  playerFor(ownerId) {
    return this._players.get(ownerId) ?? null;
  }

  /**
   * Steer a controller's player toward a world point. This sets the same
   * `target` + `hasTarget` a mob uses, so `step` moves the player identically
   * (toward the point at the player's speed). Send a point in the held/pointed
   * direction (e.g. the mouse's world position).
   * @param {*} ownerId
   * @param {number} worldX
   * @param {number} worldY
   */
  moveToward(ownerId, worldX, worldY) {
    const e = this._players.get(ownerId);
    if (!e) return;
    e.target.x = worldX;
    e.target.y = worldY;
    e.hasTarget = true;
  }

  /**
   * Steer a controller's player in a direction (e.g. from WASD). `dx`/`dy` are
   * summed key contributions: right `+x`, down `+y` (screen space), so opposite
   * keys cancel and diagonals combine. Since `target` is used as a heading, this
   * just sets the target one step ahead in that direction — diagonals are NOT
   * faster (movement always applies the player's `speed`). `(0,0)` stops.
   * @param {*} ownerId
   * @param {number} dx Net horizontal: (D held ? 1 : 0) − (A held ? 1 : 0).
   * @param {number} dy Net vertical:   (S held ? 1 : 0) − (W held ? 1 : 0).
   */
  moveDir(ownerId, dx, dy) {
    const e = this._players.get(ownerId);
    if (!e) return;
    if (dx === 0 && dy === 0) {
      e.hasTarget = false;
      return;
    }
    // Aim one step ahead in the held direction, relative to the CURRENT position
    // (recompute each frame as the player moves so the heading stays correct).
    e.target.x = e.x + dx;
    e.target.y = e.y + dy;
    e.hasTarget = true;
  }

  /**
   * Stop steering a controller's player — it coasts to a halt via the normal
   * movement decay. (Use when no movement input is held.)
   * @param {*} ownerId
   */
  stop(ownerId) {
    const e = this._players.get(ownerId);
    if (e) e.hasTarget = false;
  }
}
