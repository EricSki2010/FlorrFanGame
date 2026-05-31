// Targeting — decides what each entity aims at.
//
// A target is just a world point: { x, y }. Each entity stores one in
// `entity.target` (always an { x, y }), with `entity.hasTarget` flagging whether
// it's active. Movement in `GameEngine.step` steers toward it.

import { Disposition } from "./Entity.js";

/** Once aggroed (locked on), detection range GROWS by this — sticky aggro. */
const AGGRO_RANGE_MULT = 1.5;

// Aggro is time-limited. The sim is tick-based (movement is per-step, no dt), so
// "5 seconds" is counted in steps at the assumed tick rate — consistent with the
// rest of the engine. If a real-time clock is ever added, switch these to dt.
/** Assumed simulation rate; the client ticker runs ~this. */
const TICKS_PER_SECOND = 60;
/** A provoked mob de-aggros after this many steps WITHOUT a target in range. */
const AGGRO_TIMEOUT_STEPS = 5 * TICKS_PER_SECOND; // ~5 seconds

/**
 * The EFFECTIVE detection range an entity is seeking with right now — or `0` if
 * it isn't seeking. Single source of truth, used by both targeting and the debug
 * overlay:
 *   - PASSIVE / ALLIED: `0` (never seek).
 *   - aggroed (in combat): `range × 1.5` — grows once it has locked on, so it's
 *     harder to escape. `aggroed` is set ONLY when it detects an ally.
 *   - HOSTILE, not yet aggroed: `range` (still searches, at base range).
 *   - NEUTRAL, not aggroed: `0` (waits to be provoked).
 * @param {Object} e
 * @returns {number}
 */
export function detectionRange(e) {
  if (e.disposition === Disposition.PASSIVE || e.disposition === Disposition.ALLIED) {
    return 0;
  }
  if (e.aggroed) return e.range * AGGRO_RANGE_MULT; // in combat → grown range
  if (e.disposition === Disposition.HOSTILE) return e.range; // searching at base
  return 0; // un-aggroed neutral: not searching yet
}

/**
 * Update every seeker's target among the given (active/on-screen) entities.
 *
 * A "seeker" is a mob that is HOSTILE (always) or `aggroed` (e.g. a NEUTRAL mob
 * that was provoked); PASSIVE and ALLIED entities never seek. Each seeker looks
 * for ALLIED entities (players / pets) whose collision circle is within its
 * detection range and locks onto the CLOSEST one — otherwise it drops its target.
 *
 * Detection range comes from {@link detectionRange} (base while searching, ×1.5
 * once aggroed). "In range" means the seeker's range circle meets the ally's
 * collision circle: `dist ≤ range + ally.collisionRadius`. Detecting an ally sets
 * `aggroed` and stamps `lastTargetStep`.
 *
 * Aggro is time-limited: a seeker that has gone `AGGRO_TIMEOUT_STEPS` (~5s)
 * without a target in range gives up — `aggroed` clears, so a hostile leashes
 * back to base detection range and a provoked neutral stops seeking entirely.
 * The timer resets every time a target is (re)acquired, so a mob still in combat
 * never times out.
 *
 * @param {Array} entities The active entities to consider (potential seekers and
 *   potential allied targets both come from this list).
 * @param {number} step The current step count (`GameEngine._stepCount`), used to
 *   age the aggro timer.
 */
export function updateTargets(entities, step) {
  // Collect allied targets once (usually just the player + a few pets).
  const allies = [];
  for (let i = 0; i < entities.length; i++) {
    if (entities[i].disposition === Disposition.ALLIED) allies.push(entities[i]);
  }

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];

    // Effective detection range, or 0 if this entity isn't seeking right now.
    const range = detectionRange(e);
    if (range <= 0) continue;

    // Closest allied whose collision circle is within the detection range.
    let bestD2 = Infinity;
    let bestX = 0;
    let bestY = 0;
    let found = false;
    for (let j = 0; j < allies.length; j++) {
      const ally = allies[j];
      const dx = ally.x - e.x;
      const dy = ally.y - e.y;
      const reach = range + ally.collisionRadius;
      const d2 = dx * dx + dy * dy;
      if (d2 <= reach * reach && d2 < bestD2) {
        bestD2 = d2;
        bestX = ally.x;
        bestY = ally.y;
        found = true;
      }
    }

    if (found) {
      e.target.x = bestX;
      e.target.y = bestY;
      e.hasTarget = true;
      e.aggroed = true; // now in combat
      e.lastTargetStep = step; // reset the give-up timer
    } else {
      e.hasTarget = false;
      // No target this pass — if it's been too long since one was in range, give
      // up the chase. (Only matters for aggroed mobs; un-aggroed neutrals never
      // reach here, and an un-aggroed hostile just keeps searching at base range.)
      if (e.aggroed && step - e.lastTargetStep >= AGGRO_TIMEOUT_STEPS) {
        e.aggroed = false;
      }
    }
  }
}
