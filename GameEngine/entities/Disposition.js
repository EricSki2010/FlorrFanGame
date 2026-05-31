// Disposition "enum" — an entity's allegiance / behaviour. Its own module so
// both Entity and MobVariety can depend on it without importing each other
// (same no-cycle reason Rarity.js is separate).

/**
 * Frozen-object enum, same pattern as `MobType` / `Rarity`.
 *   - `HOSTILE` — always seeks allied targets (detection range ×1.5).
 *   - `NEUTRAL` — only seeks once `aggroed` (detection off until provoked).
 *   - `PASSIVE` — never aggressive (wanders / flees).
 *   - `ALLIED`  — players / pets: the side hostile mobs target. Doesn't seek.
 */
export const Disposition = Object.freeze({
  HOSTILE: "hostile",
  NEUTRAL: "neutral",
  PASSIVE: "passive",
  ALLIED: "allied",
});
