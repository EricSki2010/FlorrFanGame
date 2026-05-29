// Shared rarity definitions. Lives in its own module so both Entity and
// MobVariety can depend on it without importing each other (no circular dep).

/**
 * Rarity "enum" — named ids for each tier, lowest → highest. Use these constants
 * (e.g. `Rarity.MYTHIC`) instead of raw strings to avoid typos; the string
 * values double as the rarity ids stored on entities. Frozen-object enum, same
 * pattern as `MobType`. Definition order IS tier order.
 */
export const Rarity = Object.freeze({
  COMMON: "common",
  UNUSUAL: "unusual",
  RARE: "rare",
  EPIC: "epic",
  LEGENDARY: "legendary",
  MYTHIC: "mythic",
  ULTRA: "ultra",
  SUPER: "super",
});

/**
 * Tiers lowest → highest, derived from `Rarity`'s insertion order. The index is
 * the tier number that size formulas scale off of.
 * @type {readonly string[]}
 */
export const RARITY = Object.freeze(Object.values(Rarity));

/**
 * Tier index for a rarity id, clamped so an unknown rarity reads as the lowest
 * tier (0) rather than -1.
 * @param {string} rarity
 * @returns {number}
 */
export function rarityTier(rarity) {
  const t = RARITY.indexOf(rarity);
  return t < 0 ? 0 : t;
}
